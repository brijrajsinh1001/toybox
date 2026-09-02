// routes/sellers.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../config/db');
const { verifyToken, sellerOnly } = require('../middleware/auth');

const router = express.Router();

// ── REGISTER ─────────────────────────────────────────
// POST /api/sellers/register
router.post('/register', async (req, res) => {
  const { first_name, last_name, store_name, email, mobile, city, password } = req.body;

  if (!first_name || !last_name || !store_name || !email || !mobile || !city || !password)
    return res.status(400).json({ error: 'All fields are required.' });

  try {
    const [exists] = await db.query('SELECT id FROM sellers WHERE email = ?', [email]);
    if (exists.length > 0) return res.status(409).json({ error: 'Email already registered.' });

    const password_hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO sellers (first_name, last_name, store_name, email, mobile, city, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [first_name, last_name, store_name, email, mobile, city, password_hash]
    );

    res.status(201).json({ message: 'Seller account created.', seller_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LOGIN ─────────────────────────────────────────────
// POST /api/sellers/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  try {
    const [rows] = await db.query('SELECT * FROM sellers WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });

    const seller = rows[0];

    if (seller.is_suspended)
      return res.status(403).json({ error: 'Your account has been suspended. Contact support.' });

    const valid = await bcrypt.compare(password, seller.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: seller.id, email: seller.email, role: 'seller' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful.',
      token,
      seller: {
        id: seller.id,
        store_name: seller.store_name,
        name: `${seller.first_name} ${seller.last_name}`,
        email: seller.email,
        city: seller.city,
        avg_rating: seller.avg_rating,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PROFILE ───────────────────────────────────────────
// GET /api/sellers/profile
router.get('/profile', verifyToken, sellerOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, first_name, last_name, store_name, email, mobile, city,
              avg_rating, total_reviews, created_at
       FROM sellers WHERE id = ?`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Seller not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DASHBOARD STATS ───────────────────────────────────
// GET /api/sellers/dashboard
router.get('/dashboard', verifyToken, sellerOnly, async (req, res) => {
  try {
    const sid = req.user.id;

    const [[{ total_listings }]] = await db.query(
      `SELECT COUNT(*) AS total_listings FROM toy_listings WHERE seller_id = ?`, [sid]
    );
    const [[{ active_listings }]] = await db.query(
      `SELECT COUNT(*) AS active_listings FROM toy_listings WHERE seller_id = ? AND status = 'approved' AND is_available = TRUE`, [sid]
    );
    const [[{ total_rentals }]] = await db.query(
      `SELECT COUNT(*) AS total_rentals FROM rentals WHERE seller_id = ?`, [sid]
    );
    const [[{ pending_requests }]] = await db.query(
      `SELECT COUNT(*) AS pending_requests FROM buyer_requests WHERE seller_id = ? AND status = 'pending'`, [sid]
    );

    res.json({ total_listings, active_listings, total_rentals, pending_requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MY LISTINGS ───────────────────────────────────────
// GET /api/sellers/my-listings
router.get('/my-listings', verifyToken, sellerOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT tl.*, 
        (SELECT filename FROM toy_images WHERE listing_id = tl.id AND is_primary = TRUE LIMIT 1) AS primary_image
       FROM toy_listings tl
       WHERE tl.seller_id = ?
       ORDER BY tl.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── BUYER REQUESTS FOR SELLER ─────────────────────────
// GET /api/sellers/requests
router.get('/requests', verifyToken, sellerOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT br.*, 
              b.first_name, b.last_name, b.mobile AS buyer_mobile, b.city AS buyer_city,
              tl.name AS toy_name
       FROM buyer_requests br
       JOIN buyers b ON br.buyer_id = b.id
       JOIN toy_listings tl ON br.listing_id = tl.id
       WHERE br.seller_id = ?
       ORDER BY br.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RESPOND TO REQUEST ────────────────────────────────
// PUT /api/sellers/requests/:id
router.put('/requests/:id', verifyToken, sellerOnly, async (req, res) => {
  const { status } = req.body; // 'accepted' or 'rejected'
  if (!['accepted', 'rejected'].includes(status))
    return res.status(400).json({ error: 'Status must be accepted or rejected.' });

  try {
    await db.query(
      `UPDATE buyer_requests SET status = ? WHERE id = ? AND seller_id = ?`,
      [status, req.params.id, req.user.id]
    );
    res.json({ message: `Request ${status}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
