const { poolPromise, sql } = require('../db');
require('dotenv').config();

// Nombre de esta app dentro del padrón central (acceso.Permisos.App).
const APP_KEY = 'contratos';

// Rol del usuario simulado en desarrollo (solo fuera de producción).
// Configurable con DEV_USER_ROLE; por defecto ADMIN para trabajar sin restricciones local.
const DEV_USER_ROLE = (process.env.DEV_USER_ROLE || 'ADMIN').toUpperCase();

/**
 * Autenticación vía Azure App Service (Easy Auth) contra Entra ID, con el
 * padrón de acceso CENTRALIZADO (esquema acceso, compartido con proveedores,
 * etiquetas y lavados).
 *
 * En Azure, Easy Auth resuelve el login y reenvía la identidad en la cabecera
 * 'x-ms-client-principal-name' (el email del usuario ya autenticado). Este
 * middleware busca ese email en acceso.Usuarios y su permiso/rol para ESTA app
 * en acceso.Permisos (App = 'contratos').
 *
 * Es lista blanca: sin fila en acceso.Permisos no se entra (403).
 *
 * En desarrollo (sin Azure delante) simula un usuario para poder trabajar local.
 */
async function authRequired(req, res, next) {
  const email = req.headers['x-ms-client-principal-name'];

  // Fallback de desarrollo: sin cabecera de Easy Auth y fuera de producción.
  if (!email && process.env.NODE_ENV !== 'production') {
    req.user = {
      UsuarioId: 0,
      Nombre: 'Usuario Local (Dev)',
      Email: 'dev@local',
      Rol: DEV_USER_ROLE,
    };
    return next();
  }

  if (!email) {
    return res.status(401).json({ error: 'No autenticado por Azure Easy Auth.' });
  }

  try {
    const pool = await poolPromise;
    if (!pool) throw new Error('No hay conexión con la base de datos');

    // Padrón central: identidad (acceso.Usuarios) + permiso para ESTA app (acceso.Permisos).
    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .input('app', sql.VarChar, APP_KEY)
      .query(`
        SELECT u.UsuarioId, u.Email, u.Nombre, p.Rol
        FROM acceso.Usuarios u
        JOIN acceso.Permisos p ON p.UsuarioId = u.UsuarioId AND p.App = @app
        WHERE u.Email = @email AND u.Activo = 1
      `);

    const registro = result.recordset[0];
    if (!registro) {
      return res.status(403).json({ error: 'Usuario no habilitado en esta aplicación.' });
    }

    req.user = {
      UsuarioId: registro.UsuarioId,
      Nombre: registro.Nombre,
      Email: registro.Email,
      Rol: registro.Rol,
    };
    next();
  } catch (err) {
    console.error('[Auth] Error:', err.message);
    return res.status(500).json({ error: 'Error en la verificación de identidad.' });
  }
}

/**
 * Restringe el acceso a determinados roles. Los roles del padrón se guardan en
 * MAYÚSCULAS (ADMIN / GESTOR / LECTOR), así que la comparación normaliza ambos
 * lados para no depender de cómo se cargó el dato.
 */
function requireRole(...roles) {
  const permitidos = roles.map((r) => r.toUpperCase());
  return (req, res, next) => {
    const rol = String(req.user?.Rol || '').toUpperCase();
    if (!rol || !permitidos.includes(rol)) {
      return res.status(403).json({ error: 'No autorizado para esta acción' });
    }
    next();
  };
}

module.exports = { authRequired, requireRole };
