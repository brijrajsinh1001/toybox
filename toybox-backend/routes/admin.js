// routes/admin.js
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db         = require('../config/db');
const { verifyToken, adminOnly } = require('../middleware/auth');

const router = express.Router();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── STEP 1: LOGIN (sends OTP) ────────────────────────
// POST /api/admin/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  try {
    const [rows] = await db.query('SELECT * FROM admins WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });

    const admin = rows[0];
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    // Generate OTP
    const otp     = generateOTP();
    const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await db.query(
      `UPDATE admins SET otp_code = ?, otp_expires = ? WHERE id = ?`,
      [otp, expires, admin.id]
    );

    // Always print OTP to console (useful when email not set up)
    console.log('\n========================================');
    console.log('🔐 ADMIN OTP CODE: ' + otp);
    console.log('   Enter this on the admin login page');
    console.log('========================================\n');

    // Send OTP email only if Gmail is configured
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to:   admin.email,
          subject: 'ToyBox Admin OTP',
          html: `<h2>Your ToyBox Admin OTP</h2><p style="font-size:28px;font-weight:bold;letter-spacing:8px">${otp}</p><p>Expires in 5 minutes.</p>`,
        });
      } catch (mailErr) {
        console.log('Email send failed (check EMAIL_USER/EMAIL_PASS in .env) — use OTP from CMD above');
      }
    }

    res.json({ message: 'OTP generated. Check your CMD window for the code.', admin_id: admin.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── STEP 2: VERIFY OTP ────────────────────────────────
// POST /api/admin/verify-otp
router.post('/verify-otp', async (req, res) => {
  const { admin_id, otp } = req.body;
  if (!admin_id || !otp) return res.status(400).json({ error: 'admin_id and otp required.' });

  try {
    const [rows] = await db.query('SELECT * FROM admins WHERE id = ?', [admin_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Admin not found.' });

    const admin = rows[0];

    if (admin.otp_code !== otp)      return res.status(401).json({ error: 'Incorrect OTP.' });
    if (new Date() > new Date(admin.otp_expires)) return res.status(401).json({ error: 'OTP expired.' });

    // Clear OTP
    await db.query(`UPDATE admins SET otp_code = NULL, otp_expires = NULL WHERE id = ?`, [admin.id]);

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );

    res.json({ message: 'OTP verified. Admin login successful.', token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DASHBOARD STATS ───────────────────────────────────
// GET /api/admin/stats
router.get('/stats', verifyToken, adminOnly, async (req, res) => {
  try {
    const [[{ total_buyers }]]    = await db.query(`SELECT COUNT(*) AS total_buyers FROM buyers`);
    const [[{ total_sellers }]]   = await db.query(`SELECT COUNT(*) AS total_sellers FROM sellers`);
    const [[{ total_listings }]]  = await db.query(`SELECT COUNT(*) AS total_listings FROM toy_listings`);
    const [[{ pending_listings}]] = await db.query(`SELECT COUNT(*) AS pending_listings FROM toy_listings WHERE status = 'pending'`);
    const [[{ blacklisted }]]     = await db.query(`SELECT COUNT(*) AS blacklisted FROM buyers WHERE is_blacklisted = TRUE`);
    const [[{ deposits_held }]]   = await db.query(`SELECT SUM(deposit_balance) AS deposits_held FROM buyers WHERE membership_paid = TRUE`);
    const [[{ active_rentals }]]  = await db.query(`SELECT COUNT(*) AS active_rentals FROM rentals WHERE status = 'active'`);

    res.json({ total_buyers, total_sellers, total_listings, pending_listings, blacklisted, deposits_held: deposits_held || 0, active_rentals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ALL BUYERS ────────────────────────────────────────
// GET /api/admin/buyers
router.get('/buyers', verifyToken, adminOnly, async (req, res) => {
  try {
    const { search } = req.query;
    let query = `SELECT id, first_name, last_name, email, mobile, city, membership_paid, deposit_balance, is_blacklisted, blacklist_reason, created_at FROM buyers`;
    const params = [];
    if (search) { query += ` WHERE email LIKE ? OR first_name LIKE ? OR last_name LIKE ?`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    query += ` ORDER BY created_at DESC`;
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── BLACKLIST BUYER ───────────────────────────────────
// POST /api/admin/buyers/:id/blacklist
router.post('/buyers/:id/blacklist', verifyToken, adminOnly, async (req, res) => {
  const { reason, forfeit_deposit } = req.body;
  if (!reason) return res.status(400).json({ error: 'Reason is required.' });

  try {
    const updates = forfeit_deposit
      ? `is_blacklisted = TRUE, blacklist_reason = ?, blacklisted_at = NOW(), deposit_balance = 0`
      : `is_blacklisted = TRUE, blacklist_reason = ?, blacklisted_at = NOW()`;

    await db.query(`UPDATE buyers SET ${updates} WHERE id = ?`, forfeit_deposit ? [reason, req.params.id] : [reason, req.params.id]);

    if (forfeit_deposit) {
      await db.query(
        `INSERT INTO deposit_transactions (buyer_id, amount, type, reason, done_by) VALUES (?, ?, 'non_return_forfeiture', ?, ?)`,
        [req.params.id, -(parseFloat(process.env.MEMBERSHIP_AMOUNT) || 3500), reason, req.user.id]
      );
    }

    res.json({ message: 'Buyer blacklisted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UNBLACKLIST BUYER ─────────────────────────────────
// POST /api/admin/buyers/:id/unblacklist
router.post('/buyers/:id/unblacklist', verifyToken, adminOnly, async (req, res) => {
  try {
    await db.query(
      `UPDATE buyers SET is_blacklisted = FALSE, blacklist_reason = NULL, blacklisted_at = NULL WHERE id = ?`,
      [req.params.id]
    );
    res.json({ message: 'Buyer unblacklisted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DEDUCT FROM DEPOSIT ───────────────────────────────
// POST /api/admin/deposits/deduct
router.post('/deposits/deduct', verifyToken, adminOnly, async (req, res) => {
  const { buyer_id, amount, reason, rental_id } = req.body;
  if (!buyer_id || !amount || !reason) return res.status(400).json({ error: 'buyer_id, amount, reason required.' });

  try {
    const [rows] = await db.query(`SELECT deposit_balance FROM buyers WHERE id = ?`, [buyer_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Buyer not found.' });

    const newBalance = Math.max(0, parseFloat(rows[0].deposit_balance) - parseFloat(amount));

    await db.query(`UPDATE buyers SET deposit_balance = ? WHERE id = ?`, [newBalance, buyer_id]);
    await db.query(
      `INSERT INTO deposit_transactions (buyer_id, amount, type, reason, rental_id, done_by) VALUES (?, ?, 'damage_deduction', ?, ?, ?)`,
      [buyer_id, -amount, reason, rental_id || null, req.user.id]
    );

    res.json({ message: 'Deduction applied.', new_balance: newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── APPROVE / REJECT LISTING ──────────────────────────
// PUT /api/admin/listings/:id/status
router.put('/listings/:id/status', verifyToken, adminOnly, async (req, res) => {
  const { status } = req.body; // 'approved' | 'rejected' | 'removed'
  if (!['approved','rejected','removed'].includes(status))
    return res.status(400).json({ error: 'Invalid status.' });

  try {
    await db.query(`UPDATE toy_listings SET status = ? WHERE id = ?`, [status, req.params.id]);
    res.json({ message: `Listing ${status}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ALL SELLERS ───────────────────────────────────────
// GET /api/admin/sellers
router.get('/sellers', verifyToken, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, first_name, last_name, store_name, email, mobile, city, avg_rating, is_suspended, created_at FROM sellers ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SUSPEND / UNSUSPEND SELLER ────────────────────────
// PUT /api/admin/sellers/:id/suspend
router.put('/sellers/:id/suspend', verifyToken, adminOnly, async (req, res) => {
  const { suspend } = req.body; // true or false
  try {
    await db.query(`UPDATE sellers SET is_suspended = ? WHERE id = ?`, [suspend, req.params.id]);
    res.json({ message: suspend ? 'Seller suspended.' : 'Seller reinstated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ALL PENDING LISTINGS ──────────────────────────────
// GET /api/admin/listings/pending
router.get('/listings/pending', verifyToken, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT tl.*, s.store_name, s.email AS seller_email,
        (SELECT filename FROM toy_images WHERE listing_id = tl.id AND is_primary = TRUE LIMIT 1) AS primary_image
       FROM toy_listings tl
       JOIN sellers s ON tl.seller_id = s.id
       WHERE tl.status = 'pending'
       ORDER BY tl.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
