// ═══════════════════════════════════════════════════════
//  TOYBOX BACKEND — server.js
//  Serves BOTH the API and the frontend HTML files
//  Everything runs on http://localhost:5000
// ═══════════════════════════════════════════════════════
require('dotenv').config();
const express        = require('express');
const http           = require('http');
const cors           = require('cors');
const path           = require('path');
const { initSocket } = require('./socket');

const app    = express();
const server = http.createServer(app);
const io     = initSocket(server);
app.set('io', io);

// ── MIDDLEWARE ────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── SERVE UPLOADED IMAGES ─────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── SERVE FRONTEND HTML FILES ─────────────────────────
// Put all your HTML files in a folder called "frontend"
// sitting next to the toybox-backend folder:
//
//   toybox/
//   ├── frontend/          ← index.html, login-buyer.html etc.
//   └── toybox-backend/    ← server.js, routes/, etc.
//
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ── API ROUTES ────────────────────────────────────────
app.use('/api/buyers',   require('./routes/buyers'));
app.use('/api/sellers',  require('./routes/sellers'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/rentals',  require('./routes/rentals'));
app.use('/api/deposits', require('./routes/deposits'));
app.use('/api/otp',      require('./routes/otp'));
app.use('/api/damage',   require('./routes/damage'));

// ── FALLBACK: serve index.html for any unknown route ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ── ERROR HANDLER ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── START ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('');
  console.log('  🧸 ═══════════════════════════════════');
  console.log(`  🚀  ToyBox running!`);
  console.log(`  🌐  Open: http://localhost:${PORT}`);
  console.log('  🧸 ═══════════════════════════════════');
  console.log('');
});
