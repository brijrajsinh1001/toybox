// routes/listings.js
const express = require('express');
const db      = require('../config/db');
const upload  = require('../middleware/upload');
const { verifyToken, sellerOnly, buyerOnly } = require('../middleware/auth');

const router = express.Router();

// ── GET ALL APPROVED LISTINGS (public) ───────────────
// GET /api/listings?category=&city=&type=&search=
router.get('/', async (req, res) => {
  try {
    const { category, city, type, search, age_group } = req.query;
    let query = `SELECT * FROM v_listings WHERE 1=1`;
    const params = [];

    if (category)  { query += ` AND category = ?`;                   params.push(category); }
    if (city)      { query += ` AND city = ?`;                        params.push(city); }
    if (type)      { query += ` AND listing_type IN ('both', ?)`;     params.push(type); }
    if (age_group) { query += ` AND age_group = ?`;                   params.push(age_group); }
    if (search)    { query += ` AND (name LIKE ? OR description LIKE ?)`;
                     params.push(`%${search}%`, `%${search}%`); }

    query += ` ORDER BY created_at DESC`;
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET SINGLE LISTING ────────────────────────────────
// GET /api/listings/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM v_listings WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });

    // Increment view count
    await db.query(`UPDATE toy_listings SET views = views + 1 WHERE id = ?`, [req.params.id]);

    // Get all images
    const [images] = await db.query(
      `SELECT filename, is_primary FROM toy_images WHERE listing_id = ? ORDER BY is_primary DESC`,
      [req.params.id]
    );

    res.json({ ...rows[0], images });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CREATE LISTING (seller only) + upload up to 5 images ─
// POST /api/listings
router.post('/', verifyToken, sellerOnly, upload.array('images', 5), async (req, res) => {
  const {
    name, category, age_group, brand, condition_tag,
    description, listing_type, rent_price, buy_price,
    city, area, pickup_note
  } = req.body;

  if (!name || !category || !age_group || !condition_tag || !description || !listing_type || !city)
    return res.status(400).json({ error: 'Required fields missing.' });

  if (listing_type !== 'buy'  && !rent_price) return res.status(400).json({ error: 'Rent price required.' });
  if (listing_type !== 'rent' && !buy_price)  return res.status(400).json({ error: 'Buy price required.' });
  if (!req.files || req.files.length === 0)   return res.status(400).json({ error: 'At least one photo required.' });

  try {
    const [result] = await db.query(
      `INSERT INTO toy_listings
        (seller_id, name, category, age_group, brand, condition_tag, description,
         listing_type, rent_price, buy_price, city, area, pickup_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, name, category, age_group, brand || null, condition_tag,
        description, listing_type,
        rent_price || null, buy_price || null,
        city, area || null, pickup_note || null
      ]
    );

    const listingId = result.insertId;

    // Save image records
    for (let i = 0; i < req.files.length; i++) {
      await db.query(
        `INSERT INTO toy_images (listing_id, filename, is_primary) VALUES (?, ?, ?)`,
        [listingId, req.files[i].filename, i === 0]  // first image = primary
      );
    }

    res.status(201).json({
      message: 'Listing submitted for admin review.',
      listing_id: listingId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE LISTING (seller only) ─────────────────────
// PUT /api/listings/:id
router.put('/:id', verifyToken, sellerOnly, async (req, res) => {
  const { name, description, rent_price, buy_price, pickup_note, is_available } = req.body;

  try {
    // Verify ownership
    const [rows] = await db.query(`SELECT seller_id FROM toy_listings WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    if (rows[0].seller_id !== req.user.id) return res.status(403).json({ error: 'Not your listing.' });

    await db.query(
      `UPDATE toy_listings SET name = COALESCE(?, name), description = COALESCE(?, description),
       rent_price = COALESCE(?, rent_price), buy_price = COALESCE(?, buy_price),
       pickup_note = COALESCE(?, pickup_note), is_available = COALESCE(?, is_available),
       status = 'pending' WHERE id = ?`,
      [name, description, rent_price, buy_price, pickup_note, is_available, req.params.id]
    );

    res.json({ message: 'Listing updated. Awaiting re-approval.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE LISTING (seller only) ─────────────────────
// DELETE /api/listings/:id
router.delete('/:id', verifyToken, sellerOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT seller_id FROM toy_listings WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Listing not found.' });
    if (rows[0].seller_id !== req.user.id) return res.status(403).json({ error: 'Not your listing.' });

    await db.query(`UPDATE toy_listings SET status = 'removed', is_available = FALSE WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Listing removed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
