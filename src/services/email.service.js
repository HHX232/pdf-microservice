const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return _transporter;
}

/**
 * Send an arbitrary email.
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.text]
 * @param {string} [opts.from]
 */
async function sendMail({ to, subject, html, text, from }) {
  const transporter = getTransporter();
  const fromAddress = from || process.env.SMTP_FROM || process.env.SMTP_USER;

  const info = await transporter.sendMail({
    from: fromAddress,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
  });

  return { messageId: info.messageId, accepted: info.accepted };
}

/**
 * Render and send OTP verification email.
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.code  6-digit OTP
 * @param {string} [opts.appName]
 * @param {string} [opts.logoUrl]
 */
async function sendOtp({ to, code, appName = 'GoodWorker', logoUrl }) {
  const subject = `${code} — код подтверждения ${appName}`;
  const html = buildOtpHtml({ code, appName, logoUrl, subject });
  return sendMail({ to, subject, html });
}

function buildOtpHtml({ code, appName, logoUrl, subject }) {
  const digits = code.split('');
  const digitBoxes = digits
    .map(
      (d) =>
        `<td style="width:44px;height:54px;text-align:center;vertical-align:middle;` +
        `border-radius:10px;background:#f4f4f8;font-size:26px;font-weight:700;` +
        `color:#141416;font-family:'Helvetica Neue',Arial,sans-serif;padding:0 4px;">${d}</td>` +
        `<td style="width:6px;"></td>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

          <!-- Header -->
          <tr>
            <td style="background:#141416;padding:28px 40px;text-align:center;">
              ${logoUrl
                ? `<img src="${logoUrl}" alt="${appName}" height="36" style="display:block;margin:0 auto;" />`
                : `<span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">${appName}</span>`
              }
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:24px;font-weight:700;color:#141416;">
                Подтвердите email
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6;">
                Используйте этот одноразовый код для подтверждения вашего адреса
                электронной почты. Код действует <strong>15 минут</strong>.
              </p>

              <!-- OTP digits -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                <tr>${digitBoxes}</tr>
              </table>

              <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;text-align:center;">
                Если вы не запрашивали код — просто проигнорируйте это письмо.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9fb;padding:20px 40px;border-top:1px solid #f0f0f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} ${appName}. Это автоматическое письмо, не отвечайте на него.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { sendMail, sendOtp };
