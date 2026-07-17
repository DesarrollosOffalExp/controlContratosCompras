const express = require('express');
const { poolPromise, sql } = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// Choque de unique constraint / unique index en SQL Server (el 23505 de Postgres).
const ERR_DUPLICADO = [2627, 2601];

router.get('/', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { recordset } = await pool.request().query(
      'SELECT id, nombre, activo, created_at FROM compras.Sectores WHERE activo = 1 ORDER BY nombre ASC'
    );
    res.json(recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar sectores' });
  }
});

router.post('/', requireRole('admin', 'gestor'), async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre del sector es obligatorio' });

    const pool = await poolPromise;
    const { recordset } = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .query(`
        INSERT INTO compras.Sectores (nombre)
        OUTPUT INSERTED.id, INSERTED.nombre, INSERTED.activo, INSERTED.created_at
        VALUES (@nombre)
      `);
    res.status(201).json(recordset[0]);
  } catch (err) {
    if (ERR_DUPLICADO.includes(err.number)) return res.status(409).json({ error: 'El sector ya existe' });
    console.error(err);
    res.status(500).json({ error: 'Error al crear sector' });
  }
});

router.put('/:id', requireRole('admin', 'gestor'), async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'El nombre del sector es obligatorio' });

    const pool = await poolPromise;
    const { recordset } = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('id', sql.Int, Number(req.params.id))
      .query(`
        UPDATE compras.Sectores SET nombre = @nombre
        OUTPUT INSERTED.id, INSERTED.nombre, INSERTED.activo, INSERTED.created_at
        WHERE id = @id
      `);
    if (recordset.length === 0) return res.status(404).json({ error: 'Sector no encontrado' });
    res.json(recordset[0]);
  } catch (err) {
    if (ERR_DUPLICADO.includes(err.number)) return res.status(409).json({ error: 'El sector ya existe' });
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar sector' });
  }
});

router.delete('/:id', requireRole('admin', 'gestor'), async (req, res) => {
  try {
    const pool = await poolPromise;
    const { recordset: contratos } = await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .query('SELECT id FROM compras.Contratos WHERE sector_id = @id');
    if (contratos.length > 0) {
      return res.status(409).json({ error: 'No se puede eliminar un sector que está asociado a contratos' });
    }

    const { recordset } = await pool.request()
      .input('id', sql.Int, Number(req.params.id))
      .query('DELETE FROM compras.Sectores OUTPUT DELETED.id WHERE id = @id');
    if (recordset.length === 0) return res.status(404).json({ error: 'Sector no encontrado' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar sector' });
  }
});

module.exports = router;
