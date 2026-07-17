const express = require('express');
const { poolPromise, sql } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// Violación de foreign key en SQL Server (el 23503 de Postgres).
const ERR_FK = 547;

// Campos editables del proveedor, compartidos por INSERT y UPDATE.
function bindProveedor(request, b) {
  return request
    .input('razon_social', sql.NVarChar, b.razon_social)
    .input('contacto', sql.NVarChar, b.contacto || null)
    .input('email', sql.NVarChar, b.email || null)
    .input('telefono', sql.NVarChar, b.telefono || null)
    .input('direccion', sql.NVarChar, b.direccion || null)
    .input('activo', sql.Bit, b.activo === false || b.activo === 0 ? 0 : 1);
}

// GET /api/proveedores
router.get('/', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { recordset } = await pool.request()
      .query('SELECT * FROM compras.Proveedores ORDER BY razon_social');
    res.json(recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar proveedores' });
  }
});

// GET /api/proveedores/:id
router.get('/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { recordset } = await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .query('SELECT * FROM compras.Proveedores WHERE id = @id');
    if (recordset.length === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el proveedor' });
  }
});

// POST /api/proveedores
router.post('/', requireRole('admin', 'gestor'), async (req, res) => {
  try {
    if (!req.body.razon_social) return res.status(400).json({ error: 'razon_social es obligatoria' });
    const pool = await poolPromise;
    const { recordset } = await bindProveedor(pool.request(), req.body).query(`
      INSERT INTO compras.Proveedores (razon_social, contacto, email, telefono, direccion, activo)
      OUTPUT INSERTED.*
      VALUES (@razon_social, @contacto, @email, @telefono, @direccion, @activo)
    `);
    res.status(201).json(recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
});

// PUT /api/proveedores/:id
router.put('/:id', requireRole('admin', 'gestor'), async (req, res) => {
  try {
    const pool = await poolPromise;
    const request = bindProveedor(pool.request(), req.body).input('id', sql.Int, Number(req.params.id));
    const { recordset } = await request.query(`
      UPDATE compras.Proveedores SET
        razon_social=@razon_social, contacto=@contacto, email=@email,
        telefono=@telefono, direccion=@direccion, activo=@activo
      OUTPUT INSERTED.*
      WHERE id=@id
    `);
    if (recordset.length === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});

// DELETE /api/proveedores/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const pool = await poolPromise;
    const { recordset } = await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .query('DELETE FROM compras.Proveedores OUTPUT DELETED.id WHERE id = @id');
    if (recordset.length === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.status(204).end();
  } catch (err) {
    if (err.number === ERR_FK) {
      return res.status(409).json({ error: 'No se puede eliminar: el proveedor tiene contratos asociados' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

module.exports = router;
