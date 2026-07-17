const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { poolPromise } = require('./db');
const { authRequired } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Identidad del usuario logueado, para el chip de la barra de navegación.
// El login lo resuelve Easy Auth (Entra ID) antes de llegar acá; este endpoint
// solo devuelve lo que el padrón `acceso` dice de esa identidad.
app.get('/api/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

// Rutas
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/sectores', require('./routes/sectores'));
app.use('/api/contratos', require('./routes/contratos'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const pool = await poolPromise;
    if (!pool) throw new Error('sin pool');
    await pool.request().query('SELECT 1');
    res.json({ status: 'ok', db: 'conectada' });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'sin conexión' });
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// --- Frontend ---
// En Azure el backend y el build de Angular van juntos en el mismo App Service,
// así que Express sirve los estáticos y deja que el router del SPA maneje el resto.
const CLIENT_DIR = path.join(__dirname, '..', 'frontend', 'dist', 'frontend', 'browser');
if (fs.existsSync(CLIENT_DIR)) {
  app.use(express.static(CLIENT_DIR));
  app.get('*', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'index.html')));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API de contratos escuchando en http://localhost:${PORT}`);
});
