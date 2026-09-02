// routes/otp.js — Phone OTP verification (Twilio or MSG91)
// ─────────────────────────────────────────────────────────
// Setup: npm install twilio
// Then set in .env:
//   TWILIO_SID=ACxxxxxxxxxxxxxxxx
//   TWILIO_TOKEN=your_auth_token
//   TWILIO_FROM=+1XXXXXXXXXX
// ─────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();

// In-memory OTP store: { '+91XXXXXXXXXX': { code, expires } }
// In production: use Redis for this
const otpStore = new Map();

function genOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }

// ── SEND OTP ──────────────────────────────────────────────
// POST /api/otp/send
// Body: { phone: "9876543210" }
router.post('/send', async (req, res) => {
  const { phone } = req.body;
  if(!phone || !/^[6-9][0-9]{9}$/.test(phone))
    return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' });

  const fullPhone = '+91' + phone;
  const otp = genOTP();
  const expires = Date.now() + 5 * 60 * 1000; // 5 minutes

  // Store OTP
  otpStore.set(fullPhone, { otp, expires });

  // ── Send via Twilio ──
  // Uncomment the block below once you add Twilio credentials to .env
  /*
  const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  await twilio.messages.create({
    body: `Your ToyBox verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`,
    from: process.env.TWILIO_FROM,
    to:   fullPhone,
  });
  */

  // ── DEV MODE: log OTP to console ──
  console.log(`📱 OTP for ${fullPhone}: ${otp}`);

  res.json({ message: `OTP sent to +91 ${phone}` });
});

// ── VERIFY OTP ────────────────────────────────────────────
// POST /api/otp/verify
// Body: { phone: "9876543210", otp: "123456" }
router.post('/verify', (req, res) => {
  const { phone, otp } = req.body;
  if(!phone || !otp)
    return res.status(400).json({ error: 'Phone and OTP are required.' });

  const fullPhone = '+91' + phone;
  const record = otpStore.get(fullPhone);

  if(!record)
    return res.status(400).json({ error: 'No OTP sent to this number. Request a new one.' });

  if(Date.now() > record.expires){
    otpStore.delete(fullPhone);
    return res.status(400).json({ error: 'OTP has expired. Request a new one.' });
  }

  if(record.otp !== otp)
    return res.status(400).json({ error: 'Incorrect OTP. Please try again.' });

  // Valid — clear OTP from store
  otpStore.delete(fullPhone);
  res.json({ message: 'Phone number verified successfully.', verified: true });
});

module.exports = router;
