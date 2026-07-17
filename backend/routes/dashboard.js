const express = require('express');
const { poolPromise } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// GET /api/dashboard  -> KPIs y datos para el panel
router.get('/', async (req, res) => {
  try {
    const pool = await poolPromise;

    // El COUNT(*) FILTER (WHERE ...) de Postgres no existe en T-SQL: se hace
    // con SUM(CASE WHEN ...).
    const { recordset: totales } = await pool.request().query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN estado = 'activo' THEN 1 ELSE 0 END) AS activos,
        SUM(CASE WHEN estado = 'borrador' THEN 1 ELSE 0 END) AS borradores,
        SUM(CASE WHEN estado = 'vencido' THEN 1 ELSE 0 END) AS vencidos,
        SUM(CASE WHEN estado = 'cancelado' THEN 1 ELSE 0 END) AS cancelados
      FROM compras.Contratos
    `);

    // Monto total de contratos activos por moneda
    const { recordset: montos } = await pool.request().query(`
      SELECT moneda, COALESCE(SUM(monto), 0) AS total
      FROM compras.Contratos WHERE estado = 'activo'
      GROUP BY moneda
    `);

    // Contratos por sector (los contratos sin sector se agrupan como "Sin sector")
    const { recordset: porSector } = await pool.request().query(`
      SELECT COALESCE(s.nombre, 'Sin sector') AS sector, COUNT(*) AS cantidad
      FROM compras.Contratos c
      LEFT JOIN compras.Sectores s ON s.id = c.sector_id
      GROUP BY COALESCE(s.nombre, 'Sin sector')
      ORDER BY cantidad DESC
    `);

    // Por vencer en los próximos 30 días (activos)
    const { recordset: porVencer } = await pool.request().query(`
      SELECT COUNT(*) AS por_vencer FROM compras.Contratos
      WHERE estado = 'activo'
        AND DATEDIFF(day, CAST(SYSDATETIME() AS DATE), fecha_fin) BETWEEN 0 AND 30
    `);

    // Vencidos que siguen marcados como activos (necesitan atención)
    const { recordset: reqAtencion } = await pool.request().query(`
      SELECT COUNT(*) AS requieren_atencion FROM compras.Contratos
      WHERE estado = 'activo' AND fecha_fin < CAST(SYSDATETIME() AS DATE)
    `);

    res.json({
      totales: totales[0],
      montos_por_moneda: montos,
      por_sector: porSector,
      por_vencer_30d: porVencer[0].por_vencer,
      requieren_atencion: reqAtencion[0].requieren_atencion,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el dashboard' });
  }
});

module.exports = router;
