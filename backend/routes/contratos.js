const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { poolPromise, sql } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// --- Almacenamiento de PDFs ---
// En App Service, /home es el único disco persistente entre reinicios y deploys.
// UPLOAD_DIR permite apuntarlo ahí (ej. /home/data/contratos) sin tocar el código.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads', 'contratos');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `contrato-${req.params.id}-${Date.now()}${path.extname(file.originalname) || '.pdf'}`;
    cb(null, unique);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Solo se permiten archivos PDF'));
  },
});

// dias_restantes se calcula en el servidor (antes era `fecha_fin - CURRENT_DATE`
// de Postgres; en T-SQL es DATEDIFF).
const SELECT_BASE = `
  SELECT c.*, pr.razon_social AS proveedor_nombre,
         s.nombre AS sector_nombre,
         DATEDIFF(day, CAST(SYSDATETIME() AS DATE), c.fecha_fin) AS dias_restantes
  FROM compras.Contratos c
  JOIN compras.Proveedores pr ON pr.id = c.proveedor_id
  LEFT JOIN compras.Sectores s ON s.id = c.sector_id
`;

// Choque de unique constraint / unique index en SQL Server (el 23505 de Postgres).
const ERR_DUPLICADO = [2627, 2601];

// GET /api/contratos?estado=&tipo=&proveedor_id=&buscar=&por_vencer=30
router.get('/', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { estado, tipo, proveedor_id, buscar, por_vencer } = req.query;
    const request = pool.request();
    const where = [];

    if (estado) {
      where.push('c.estado = @estado');
      request.input('estado', sql.VarChar, estado);
    }
    if (tipo) {
      where.push('c.tipo = @tipo');
      request.input('tipo', sql.VarChar, tipo);
    }
    if (proveedor_id) {
      where.push('c.proveedor_id = @proveedor_id');
      request.input('proveedor_id', sql.Int, Number(proveedor_id));
    }
    if (buscar) {
      // El collation por defecto de SQL Server no distingue mayúsculas, así que
      // LIKE ya cubre lo que en Postgres pedía ILIKE.
      where.push('(c.numero LIKE @buscar OR c.titulo LIKE @buscar OR pr.razon_social LIKE @buscar)');
      request.input('buscar', sql.NVarChar, `%${buscar}%`);
    }
    if (por_vencer) {
      where.push(`c.estado = 'activo' AND DATEDIFF(day, CAST(SYSDATETIME() AS DATE), c.fecha_fin) BETWEEN 0 AND @por_vencer`);
      request.input('por_vencer', sql.Int, Number(por_vencer));
    }

    const query = SELECT_BASE +
      (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ' ORDER BY c.fecha_fin ASC';
    const { recordset } = await request.query(query);
    res.json(recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar contratos' });
  }
});

// Trae un contrato ya "enriquecido" (proveedor, sector, dias_restantes).
async function buscarPorId(id) {
  const pool = await poolPromise;
  const { recordset } = await pool.request()
    .input('id', sql.Int, Number(id))
    .query(SELECT_BASE + ' WHERE c.id = @id');
  return recordset[0] || null;
}

// GET /api/contratos/:id
router.get('/:id', async (req, res) => {
  try {
    const contrato = await buscarPorId(req.params.id);
    if (!contrato) return res.status(404).json({ error: 'Contrato no encontrado' });
    res.json(contrato);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el contrato' });
  }
});

function validate(body) {
  const required = ['titulo', 'proveedor_id', 'sector_id', 'fecha_inicio', 'fecha_fin'];
  for (const f of required) {
    if (!body[f]) return `El campo ${f} es obligatorio`;
  }
  if (new Date(body.fecha_fin) < new Date(body.fecha_inicio)) {
    return 'La fecha fin no puede ser anterior a la fecha inicio';
  }
  return null;
}

// Genera el próximo número de contrato del año en curso: C-AAAA-NNN.
// Toma el último tramo del número (lo que en Postgres hacía SPLIT_PART).
async function generarNumero() {
  const pool = await poolPromise;
  const year = new Date().getFullYear();
  const { recordset } = await pool.request()
    .input('patron', sql.NVarChar, `C-${year}-%`)
    .query(`
      SELECT MAX(TRY_CAST(RIGHT(numero, CHARINDEX('-', REVERSE(numero)) - 1) AS INT)) AS maxSeq
      FROM compras.Contratos WHERE numero LIKE @patron
    `);
  const next = (recordset[0].maxSeq || 0) + 1;
  return `C-${year}-${String(next).padStart(3, '0')}`;
}

// Carga los campos de un contrato en un request de mssql (INSERT y UPDATE
// comparten exactamente el mismo set, salvo el número).
function bindContrato(request, b) {
  return request
    .input('titulo', sql.NVarChar, b.titulo)
    .input('descripcion', sql.NVarChar, b.descripcion || null)
    .input('proveedor_id', sql.Int, Number(b.proveedor_id))
    .input('sector_id', sql.Int, b.sector_id ?? null)
    .input('tipo', sql.VarChar, b.tipo || 'servicio')
    .input('monto', sql.Decimal(14, 2), b.monto || 0)
    .input('moneda', sql.VarChar, b.moneda || 'USD')
    .input('fecha_inicio', sql.Date, b.fecha_inicio)
    .input('fecha_fin', sql.Date, b.fecha_fin)
    .input('estado', sql.VarChar, b.estado || 'borrador')
    .input('responsable', sql.NVarChar, b.responsable || null);
}

// POST /api/contratos
router.post('/', requireRole('admin', 'gestor'), async (req, res) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const pool = await poolPromise;
    const b = req.body;

    // El número de contrato se genera automáticamente; se reintenta ante colisiones.
    let insertedId;
    for (let intento = 0; intento < 5; intento++) {
      const numero = await generarNumero();
      try {
        const request = bindContrato(pool.request(), b).input('numero', sql.NVarChar, numero);
        const { recordset } = await request.query(`
          INSERT INTO compras.Contratos
            (numero, titulo, descripcion, proveedor_id, sector_id, tipo, monto, moneda,
             fecha_inicio, fecha_fin, estado, responsable)
          OUTPUT INSERTED.id
          VALUES (@numero, @titulo, @descripcion, @proveedor_id, @sector_id, @tipo, @monto,
                  @moneda, @fecha_inicio, @fecha_fin, @estado, @responsable)
        `);
        insertedId = recordset[0].id;
        break;
      } catch (e) {
        if (ERR_DUPLICADO.includes(e.number) && intento < 4) continue;
        throw e;
      }
    }
    res.status(201).json(await buscarPorId(insertedId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear contrato' });
  }
});

// PUT /api/contratos/:id
router.put('/:id', requireRole('admin', 'gestor'), async (req, res) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const pool = await poolPromise;

    // El número de contrato no se puede modificar: no se incluye en el UPDATE.
    // updated_at se setea acá (en Postgres lo hacía un trigger; ver db.js).
    const request = bindContrato(pool.request(), req.body).input('id', sql.Int, Number(req.params.id));
    const { recordset } = await request.query(`
      UPDATE compras.Contratos SET
        titulo=@titulo, descripcion=@descripcion, proveedor_id=@proveedor_id, sector_id=@sector_id,
        tipo=@tipo, monto=@monto, moneda=@moneda, fecha_inicio=@fecha_inicio, fecha_fin=@fecha_fin,
        estado=@estado, responsable=@responsable, updated_at=SYSUTCDATETIME()
      OUTPUT INSERTED.id
      WHERE id=@id
    `);
    if (recordset.length === 0) return res.status(404).json({ error: 'Contrato no encontrado' });
    res.json(await buscarPorId(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar contrato' });
  }
});

// --- PDF del contrato ---

// POST /api/contratos/:id/archivo  (subir/reemplazar PDF, campo "archivo")
router.post('/:id/archivo', requireRole('admin', 'gestor'), (req, res) => {
  upload.single('archivo')(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.message || 'Error al subir el archivo' });
    }
    if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
    try {
      const pool = await poolPromise;
      const { recordset } = await pool.request()
        .input('id', sql.Int, Number(req.params.id))
        .query('SELECT archivo_ruta FROM compras.Contratos WHERE id = @id');
      if (recordset.length === 0) {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Contrato no encontrado' });
      }
      // Elimina el PDF anterior si existía
      const anterior = recordset[0].archivo_ruta;
      if (anterior) {
        fs.unlink(path.join(UPLOAD_DIR, path.basename(anterior)), () => {});
      }
      await pool.request()
        .input('archivo_nombre', sql.NVarChar, req.file.originalname)
        .input('archivo_ruta', sql.NVarChar, req.file.filename)
        .input('id', sql.Int, Number(req.params.id))
        .query('UPDATE compras.Contratos SET archivo_nombre = @archivo_nombre, archivo_ruta = @archivo_ruta WHERE id = @id');
      res.json(await buscarPorId(req.params.id));
    } catch (err) {
      console.error(err);
      fs.unlink(req.file.path, () => {});
      res.status(500).json({ error: 'Error al guardar el archivo' });
    }
  });
});

// GET /api/contratos/:id/archivo  (descargar PDF)
router.get('/:id/archivo', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { recordset } = await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .query('SELECT archivo_nombre, archivo_ruta FROM compras.Contratos WHERE id = @id');
    if (recordset.length === 0 || !recordset[0].archivo_ruta) {
      return res.status(404).json({ error: 'El contrato no tiene un PDF adjunto' });
    }
    const ruta = path.join(UPLOAD_DIR, path.basename(recordset[0].archivo_ruta));
    if (!fs.existsSync(ruta)) {
      return res.status(404).json({ error: 'El archivo no se encuentra en el servidor' });
    }
    res.download(ruta, recordset[0].archivo_nombre || 'contrato.pdf');
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al descargar el archivo' });
  }
});

// DELETE /api/contratos/:id/archivo  (quitar PDF)
router.delete('/:id/archivo', requireRole('admin', 'gestor'), async (req, res) => {
  try {
    const pool = await poolPromise;
    const { recordset } = await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .query('SELECT archivo_ruta FROM compras.Contratos WHERE id = @id');
    if (recordset.length === 0) return res.status(404).json({ error: 'Contrato no encontrado' });
    if (recordset[0].archivo_ruta) {
      fs.unlink(path.join(UPLOAD_DIR, path.basename(recordset[0].archivo_ruta)), () => {});
    }
    await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .query('UPDATE compras.Contratos SET archivo_nombre = NULL, archivo_ruta = NULL WHERE id = @id');
    res.json(await buscarPorId(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al quitar el archivo' });
  }
});

// DELETE /api/contratos/:id
router.delete('/:id', requireRole('admin', 'gestor'), async (req, res) => {
  try {
    const pool = await poolPromise;
    const { recordset } = await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .query('DELETE FROM compras.Contratos OUTPUT DELETED.archivo_ruta WHERE id = @id');
    if (recordset.length === 0) return res.status(404).json({ error: 'Contrato no encontrado' });
    if (recordset[0].archivo_ruta) {
      fs.unlink(path.join(UPLOAD_DIR, path.basename(recordset[0].archivo_ruta)), () => {});
    }
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar contrato' });
  }
});

module.exports = router;
