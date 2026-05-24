const emailService = require('../services/email.service');

class EmailController {
  /**
   * POST /api/email/send
   * Body: { to, subject, html, text?, from? }
   */
  async send(req, res, next) {
    try {
      const { to, subject, html, text, from } = req.body;

      if (!to || !subject || !html) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Fields "to", "subject" and "html" are required',
        });
      }

      const result = await emailService.sendMail({ to, subject, html, text, from });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/email/send-otp
   * Body: { to, code, appName?, logoUrl? }
   */
  async sendOtp(req, res, next) {
    try {
      const { to, code, appName, logoUrl } = req.body;

      if (!to || !code) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Fields "to" and "code" are required',
        });
      }

      if (!/^\d{4,8}$/.test(code)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: '"code" must be 4–8 digits',
        });
      }

      const result = await emailService.sendOtp({ to, code, appName, logoUrl });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new EmailController();
