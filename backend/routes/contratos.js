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
    // Sufijo aleatorio además del timestamp: al subir varios de una, comparten Date.now().
    const rand = Math.round(Math.random() * 1e9);
    const unique = `contrato-${req.params.id}-${Date.now()}-${rand}${path.extname(file.originalname) || ''}`;
    cb(null, unique);
  },
});

// Tipos permitidos para los adjuntos: PDF, imágenes y documentos de oficina.
const MIMES_PERMITIDOS = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB por archivo
  fileFilter: (req, file, cb) => {
    if (MIMES_PERMITIDOS.has(file.mimetype)) return cb(null, true);
    cb(new Error('Tipo de archivo no permitido (PDF, imágenes o documentos de oficina)'));
  },
});

// dias_restantes se calcula en el servidor (antes era `fecha_fin - CURRENT_DATE`
// de Postgres; en T-SQL es DATEDIFF).
const SELECT_BASE = `
  SELECT c.*, pr.razon_social AS proveedor_nombre,
         s.nombre AS sector_nombre,
         DATEDIFF(day, CAST(SYSDATETIME() AS DATE), c.fecha_fin) AS dias_restantes,
         (SELECT COUNT(*) FROM compras.ContratoAdjuntos a WHERE a.contrato_id = c.id) AS adjuntos_count
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

// Lista de adjuntos (metadatos, sin la ruta interna) de un contrato.
async function listarAdjuntos(contratoId) {
  const pool = await poolPromise;
  const { recordset } = await pool.request()
    .input('cid', sql.Int, Number(contratoId))
    .query(`
      SELECT id, archivo_nombre, tamano, content_type, created_at
      FROM compras.ContratoAdjuntos
      WHERE contrato_id = @cid
      ORDER BY created_at, id
    `);
  return recordset;
}

// Trae un contrato ya "enriquecido" (proveedor, sector, dias_restantes, adjuntos).
async function buscarPorId(id) {
  const pool = await poolPromise;
  const { recordset } = await pool.request()
    .input('id', sql.Int, Number(id))
    .query(SELECT_BASE + ' WHERE c.id = @id');
  const contrato = recordset[0] || null;
  if (contrato) contrato.adjuntos = await listarAdjuntos(id);
  return contrato;
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

// --- Adjuntos del contrato (varios PDFs / documentos) ---

// POST /api/contratos/:id/adjuntos  (subir uno o varios, campo "archivos")
router.post('/:id/adjuntos', requireRole('admin', 'gestor'), (req, res) => {
  upload.array('archivos', 20)(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.message || 'Error al subir los archivos' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }
    const limpiar = () => req.files.forEach((f) => fs.unlink(f.path, () => {}));
    try {
      const pool = await poolPromise;
      const existe = await pool.request()
        .input('id', sql.Int, Number(req.params.id))
        .query('SELECT id FROM compras.Contratos WHERE id = @id');
      if (existe.recordset.length === 0) {
        limpiar();
        return res.status(404).json({ error: 'Contrato no encontrado' });
      }
      for (const f of req.files) {
        await pool.request()
          .input('contrato_id', sql.Int, Number(req.params.id))
          .input('archivo_nombre', sql.NVarChar, f.originalname)
          .input('archivo_ruta', sql.NVarChar, f.filename)
          .input('tamano', sql.BigInt, f.size)
          .input('content_type', sql.NVarChar, f.mimetype)
          .query(`
            INSERT INTO compras.ContratoAdjuntos
              (contrato_id, archivo_nombre, archivo_ruta, tamano, content_type)
            VALUES (@contrato_id, @archivo_nombre, @archivo_ruta, @tamano, @content_type)
          `);
      }
      res.status(201).json(await buscarPorId(req.params.id));
    } catch (err) {
      console.error(err);
      limpiar();
      res.status(500).json({ error: 'Error al guardar los archivos' });
    }
  });
});

// GET /api/contratos/:id/adjuntos/:adjId  (descargar un adjunto)
router.get('/:id/adjuntos/:adjId', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { recordset } = await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .input('adjId', sql.Int, Number(req.params.adjId))
      .query(`
        SELECT archivo_nombre, archivo_ruta
        FROM compras.ContratoAdjuntos
        WHERE id = @adjId AND contrato_id = @id
      `);
    if (recordset.length === 0) {
      return res.status(404).json({ error: 'Adjunto no encontrado' });
    }
    const ruta = path.join(UPLOAD_DIR, path.basename(recordset[0].archivo_ruta));
    if (!fs.existsSync(ruta)) {
      return res.status(404).json({ error: 'El archivo no se encuentra en el servidor' });
    }
    res.download(ruta, recordset[0].archivo_nombre || 'adjunto');
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al descargar el adjunto' });
  }
});

// DELETE /api/contratos/:id/adjuntos/:adjId  (quitar un adjunto)
router.delete('/:id/adjuntos/:adjId', requireRole('admin', 'gestor'), async (req, res) => {
  try {
    const pool = await poolPromise;
    const { recordset } = await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .input('adjId', sql.Int, Number(req.params.adjId))
      .query(`
        DELETE FROM compras.ContratoAdjuntos
        OUTPUT DELETED.archivo_ruta
        WHERE id = @adjId AND contrato_id = @id
      `);
    if (recordset.length === 0) return res.status(404).json({ error: 'Adjunto no encontrado' });
    fs.unlink(path.join(UPLOAD_DIR, path.basename(recordset[0].archivo_ruta)), () => {});
    res.json(await buscarPorId(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al quitar el adjunto' });
  }
});

// DELETE /api/contratos/:id
router.delete('/:id', requireRole('admin', 'gestor'), async (req, res) => {
  try {
    const pool = await poolPromise;
    // Rutas de los archivos en disco antes de borrar (el FK ON DELETE CASCADE
    // borra las filas de adjuntos, pero no los archivos físicos).
    const adj = await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .query('SELECT archivo_ruta FROM compras.ContratoAdjuntos WHERE contrato_id = @id');
    const { recordset } = await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .query('DELETE FROM compras.Contratos OUTPUT DELETED.archivo_ruta WHERE id = @id');
    if (recordset.length === 0) return res.status(404).json({ error: 'Contrato no encontrado' });
    const rutas = [...adj.recordset.map((r) => r.archivo_ruta), recordset[0].archivo_ruta].filter(Boolean);
    rutas.forEach((r) => fs.unlink(path.join(UPLOAD_DIR, path.basename(r)), () => {}));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar contrato' });
  }
});

module.exports = router;
