// routes/buyers.js
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../config/db');
const { verifyToken, buyerOnly } = require('../middleware/auth');

const router = express.Router();

// ── REGISTER ──────────────────────────────────────────
// POST /api/buyers/register
router.post('/register', async (req, res) => {
  const { first_name, last_name, email, mobile, city, password } = req.body;

  if (!first_name || !last_name || !email || !mobile || !city || !password)
    return res.status(400).json({ error: 'All fields are required.' });

  try {
    // Check duplicate email
    const [exists] = await db.query('SELECT id FROM buyers WHERE email = ?', [email]);
    if (exists.length > 0) return res.status(409).json({ error: 'Email already registered.' });

    const password_hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO buyers (first_name, last_name, email, mobile, city, password_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [first_name, last_name, email, mobile, city, password_hash]
    );

    res.status(201).json({
      message: 'Buyer account created successfully.',
      buyer_id: result.insertId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LOGIN ─────────────────────────────────────────────
// POST /api/buyers/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  try {
    const [rows] = await db.query('SELECT * FROM buyers WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });

    const buyer = rows[0];

    if (buyer.is_blacklisted)
      return res.status(403).json({ error: `Your account is blacklisted. Reason: ${buyer.blacklist_reason}` });

    const valid = await bcrypt.compare(password, buyer.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: buyer.id, email: buyer.email, role: 'buyer' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful.',
      token,
      buyer: {
        id: buyer.id,
        name: `${buyer.first_name} ${buyer.last_name}`,
        email: buyer.email,
        city: buyer.city,
        membership_paid: buyer.membership_paid,
        deposit_balance: buyer.deposit_balance,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET PROFILE ───────────────────────────────────────
// GET /api/buyers/profile
router.get('/profile', verifyToken, buyerOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, first_name, last_name, email, mobile, city,
              membership_paid, deposit_balance, is_blacklisted, created_at
       FROM buyers WHERE id = ?`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Buyer not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PAY MEMBERSHIP ────────────────────────────────────
// POST /api/buyers/pay-membership
// In production: integrate Razorpay/Stripe here
router.post('/pay-membership', verifyToken, buyerOnly, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM buyers WHERE id = ?', [req.user.id]);
    const buyer = rows[0];

    if (buyer.membership_paid)
      return res.status(400).json({ error: 'Membership already paid.' });

    const AMOUNT = parseFloat(process.env.MEMBERSHIP_AMOUNT) || 3500;

    // Update buyer deposit
    await db.query(
      `UPDATE buyers SET membership_paid = TRUE, deposit_balance = ? WHERE id = ?`,
      [AMOUNT, req.user.id]
    );

    // Record transaction
    await db.query(
      `INSERT INTO deposit_transactions (buyer_id, amount, type, reason)
       VALUES (?, ?, 'membership_paid', 'Initial membership deposit paid')`,
      [req.user.id, AMOUNT]
    );

    res.json({ message: `Membership activated. ₹${AMOUNT} deposit recorded.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET ACTIVE RENTALS ────────────────────────────────
// GET /api/buyers/rentals
router.get('/rentals', verifyToken, buyerOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT r.*, tl.name AS toy_name, tl.category, s.store_name
       FROM rentals r
       JOIN toy_listings tl ON r.listing_id = tl.id
       JOIN sellers s ON r.seller_id = s.id
       WHERE r.buyer_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET PURCHASE HISTORY ──────────────────────────────
// GET /api/buyers/purchases
router.get('/purchases', verifyToken, buyerOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, tl.name AS toy_name, s.store_name
       FROM purchases p
       JOIN toy_listings tl ON p.listing_id = tl.id
       JOIN sellers s ON p.seller_id = s.id
       WHERE p.buyer_id = ?
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET DEPOSIT HISTORY ───────────────────────────────
// GET /api/buyers/deposit-history
router.get('/deposit-history', verifyToken, buyerOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM deposit_transactions WHERE buyer_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
