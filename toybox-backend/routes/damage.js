// routes/damage.js — Damage report submission
const express = require('express');
const db      = require('../config/db');
const upload  = require('../middleware/upload');
const { verifyToken } = require('../middleware/auth');
const router  = express.Router();

// POST /api/damage/report — submit damage report with photos
router.post('/report', verifyToken, upload.array('photos', 6), async (req, res) => {
  const {
    txn_id, toy_name, seller_name,
    report_type, damage_type, severity, description,
    rental_id
  } = req.body;

  if(!txn_id || !toy_name || !report_type || !damage_type || !severity || !description)
    return res.status(400).json({ error: 'All fields are required.' });

  if(!req.files || req.files.length === 0)
    return res.status(400).json({ error: 'At least 1 photo is required.' });

  if(description.trim().length < 15)
    return res.status(400).json({ error: 'Describe the damage in more detail.' });

  try {
    // Save report to DB
    const [result] = await db.query(
      `INSERT INTO damage_reports
         (buyer_id, rental_id, txn_id, toy_name, seller_name, report_type, damage_type, severity, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        req.user.id,
        rental_id || null,
        txn_id, toy_name, seller_name || null,
        report_type, damage_type, severity, description.trim()
      ]
    );

    // Save photo file references
    for(const file of req.files){
      await db.query(
        `INSERT INTO damage_photos (report_id, filename) VALUES (?, ?)`,
        [result.insertId, file.filename]
      );
    }

    // Generate reference number
    const ref = `DMG-${result.insertId.toString().padStart(6,'0')}`;

    res.status(201).json({
      message: 'Damage report submitted. Admin will review within 48 hours.',
      report_id: result.insertId,
      reference: ref,
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/damage/my-reports — buyer views own reports
router.get('/my-reports', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT dr.*, GROUP_CONCAT(dp.filename) AS photos
       FROM damage_reports dr
       LEFT JOIN damage_photos dp ON dp.report_id = dr.id
       WHERE dr.buyer_id = ?
       GROUP BY dr.id
       ORDER BY dr.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
