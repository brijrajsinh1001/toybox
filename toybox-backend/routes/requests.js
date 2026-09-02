// routes/requests.js — Buyer contacts seller + Socket.io notification
const express = require('express');
const db = require('../config/db');
const { verifyToken, buyerOnly } = require('../middleware/auth');
const { notifySeller, notifyBuyer } = require('../socket');
const router = express.Router();

// POST /api/requests — Buyer sends request to seller
router.post('/', verifyToken, buyerOnly, async (req, res) => {
  const { listing_id, request_type, message } = req.body;
  if(!listing_id || !request_type || !message)
    return res.status(400).json({ error: 'listing_id, request_type, and message are required.' });

  try {
    // Check membership
    const [buyer] = await db.query(
      `SELECT membership_paid, is_blacklisted, first_name FROM buyers WHERE id = ?`,
      [req.user.id]
    );
    if(!buyer[0].membership_paid)
      return res.status(403).json({ error: 'Pay your ₹3,500 membership deposit first.' });
    if(buyer[0].is_blacklisted)
      return res.status(403).json({ error: 'Your account is blacklisted.' });

    // Get listing + seller info
    const [listing] = await db.query(
      `SELECT tl.*, s.store_name FROM toy_listings tl
       JOIN sellers s ON tl.seller_id = s.id
       WHERE tl.id = ? AND tl.status = 'approved' AND tl.is_available = TRUE`,
      [listing_id]
    );
    if(!listing.length)
      return res.status(404).json({ error: 'Listing not found or unavailable.' });

    // Prevent duplicate
    const [dup] = await db.query(
      `SELECT id FROM buyer_requests WHERE buyer_id = ? AND listing_id = ? AND status = 'pending'`,
      [req.user.id, listing_id]
    );
    if(dup.length)
      return res.status(409).json({ error: 'You already have a pending request for this listing.' });

    const [result] = await db.query(
      `INSERT INTO buyer_requests (buyer_id, seller_id, listing_id, request_type, message)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, listing[0].seller_id, listing_id, request_type, message]
    );

    // ── SOCKET: Notify seller of new request ──
    const io = req.app.get('io');
    notifySeller(io, listing[0].seller_id, 'new_request', {
      type:       'new_request',
      request_id: result.insertId,
      buyer_name: buyer[0].first_name,
      toy_name:   listing[0].name,
      req_type:   request_type,
      message,
      time:       new Date().toISOString(),
    });

    res.status(201).json({ message: 'Request sent to seller.', request_id: result.insertId });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/requests/:id/respond — Seller accepts or rejects request
router.put('/:id/respond', verifyToken, async (req, res) => {
  const { status } = req.body; // 'accepted' | 'rejected'
  if(!['accepted','rejected'].includes(status))
    return res.status(400).json({ error: 'Status must be accepted or rejected.' });

  try {
    // Verify ownership
    const [rows] = await db.query(
      `SELECT br.*, tl.name AS toy_name, s.store_name
       FROM buyer_requests br
       JOIN toy_listings tl ON br.listing_id = tl.id
       JOIN sellers s ON br.seller_id = s.id
       WHERE br.id = ?`,
      [req.params.id]
    );
    if(!rows.length) return res.status(404).json({ error: 'Request not found.' });
    if(rows[0].seller_id !== req.user.id) return res.status(403).json({ error: 'Not your request.' });

    await db.query(
      `UPDATE buyer_requests SET status = ? WHERE id = ?`,
      [status, req.params.id]
    );

    // ── SOCKET: Notify buyer of seller's decision ──
    const io  = req.app.get('io');
    const req_data = rows[0];

    notifyBuyer(io, req_data.buyer_id, 'request_update', {
      type:       'request_update',
      request_id: Number(req.params.id),
      status,
      toy_name:   req_data.toy_name,
      store_name: req_data.store_name,
      // If accepted, buyer can now arrange pickup with seller
      message: status === 'accepted'
        ? `✅ Great news! ${req_data.store_name} has accepted your request for "${req_data.toy_name}". You can now contact the seller to arrange pickup.`
        : `❌ ${req_data.store_name} has declined your request for "${req_data.toy_name}".`,
      time: new Date().toISOString(),
    });

    res.json({ message: `Request ${status}.` });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/mine — Buyer's own requests
router.get('/mine', verifyToken, buyerOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT br.*, tl.name AS toy_name, s.store_name, s.mobile AS seller_mobile
       FROM buyer_requests br
       JOIN toy_listings tl ON br.listing_id = tl.id
       JOIN sellers s ON br.seller_id = s.id
       WHERE br.buyer_id = ?
       ORDER BY br.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
