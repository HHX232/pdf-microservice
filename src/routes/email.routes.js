const express = require('express');
const router = express.Router();
const emailController = require('../controllers/email.controller');

// API-key auth middleware
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  const expected = process.env.API_SECRET_KEY;

  if (!expected) {
    // No key configured — allow in development only
    if (process.env.NODE_ENV !== 'production') return next();
    return res.status(500).json({ error: 'Server misconfiguration: API_SECRET_KEY not set' });
  }

  if (!key || key !== expected) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing x-api-key header' });
  }

  next();
}

/**
 * POST /api/email/send
 * Send arbitrary transactional email.
 * Headers: x-api-key
 * Body: { to, subject, html, text?, from? }
 */
router.post('/send', requireApiKey, emailController.send);

/**
 * POST /api/email/send-otp
 * Send OTP verification email using the built-in template.
 * Headers: x-api-key
 * Body: { to, code, appName?, logoUrl? }
 */
router.post('/send-otp', requireApiKey, emailController.sendOtp);

module.exports = router;
