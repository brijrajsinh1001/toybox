// routes/rentals.js
const express = require('express');
const db = require('../config/db');
const { verifyToken, sellerOnly, adminOnly } = require('../middleware/auth');
const router = express.Router();

// POST /api/rentals — Seller confirms rental after request accepted
router.post('/', verifyToken, sellerOnly, async (req, res) => {
  const { request_id, start_date, due_date } = req.body;
  if (!request_id || !start_date || !due_date)
    return res.status(400).json({ error: 'request_id, start_date, due_date required.' });

  try {
    const [req_rows] = await db.query(
      `SELECT * FROM buyer_requests WHERE id = ? AND seller_id = ? AND request_type = 'rent'`,
      [request_id, req.user.id]
    );
    if (req_rows.length === 0) return res.status(404).json({ error: 'Request not found.' });
    const request = req_rows[0];

    const [listing] = await db.query(`SELECT rent_price FROM toy_listings WHERE id = ?`, [request.listing_id]);

    const [result] = await db.query(
      `INSERT INTO rentals (buyer_id, seller_id, listing_id, request_id, rent_per_day, start_date, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [request.buyer_id, req.user.id, request.listing_id, request_id, listing[0].rent_price, start_date, due_date]
    );

    // Update listing availability
    await db.query(`UPDATE toy_listings SET is_available = FALSE WHERE id = ?`, [request.listing_id]);
    await db.query(`UPDATE buyer_requests SET status = 'completed' WHERE id = ?`, [request_id]);

    res.status(201).json({ message: 'Rental created.', rental_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/rentals/:id/return — Mark rental returned
router.put('/:id/return', verifyToken, async (req, res) => {
  try {
    await db.query(
      `UPDATE rentals SET status = 'returned', returned_at = NOW() WHERE id = ?`,
      [req.params.id]
    );
    // Re-enable availability
    const [r] = await db.query(`SELECT listing_id FROM rentals WHERE id = ?`, [req.params.id]);
    if (r.length > 0) await db.query(`UPDATE toy_listings SET is_available = TRUE WHERE id = ?`, [r[0].listing_id]);

    res.json({ message: 'Rental marked as returned.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
