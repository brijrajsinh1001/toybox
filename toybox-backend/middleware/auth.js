// middleware/auth.js — Verify JWT tokens
const jwt = require('jsonwebtoken');

// Generic token verifier — attach decoded user to req
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

// Role-specific guards
function buyerOnly(req, res, next) {
  if (req.user?.role !== 'buyer') return res.status(403).json({ error: 'Buyers only.' });
  next();
}

function sellerOnly(req, res, next) {
  if (req.user?.role !== 'seller') return res.status(403).json({ error: 'Sellers only.' });
  next();
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });
  next();
}

module.exports = { verifyToken, buyerOnly, sellerOnly, adminOnly };
