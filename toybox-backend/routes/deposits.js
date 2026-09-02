// routes/deposits.js
const express = require('express');
const db = require('../config/db');
const { verifyToken, buyerOnly } = require('../middleware/auth');
const router = express.Router();

// GET /api/deposits/my-history
router.get('/my-history', verifyToken, buyerOnly, async (req, res) => {
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
