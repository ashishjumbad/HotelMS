const nodemailer = require('nodemailer');

const isSmtpConfigured = () => {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.MAIL_FROM
  );
};

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
  if (!isSmtpConfigured()) {
    console.log(`Password reset link for ${to}: ${resetUrl}`);

    return {
      delivered: false,
      reason: 'smtp_not_configured'
    };
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: 'Reset your HotelMS password',
    text: [
      `Hello${name ? ` ${name}` : ''},`,
      '',
      'We received a request to reset your password.',
      `Reset your password here: ${resetUrl}`,
      '',
      'This link expires in 1 hour.',
      'If you did not request this, you can ignore this email.'
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <h2 style="margin-bottom: 16px;">Reset your password</h2>
        <p>Hello${name ? ` ${name}` : ''},</p>
        <p>We received a request to reset your HotelMS password.</p>
        <p>
          <a
            href="${resetUrl}"
            style="display: inline-block; padding: 12px 20px; background: #1f2937; color: #ffffff; text-decoration: none; border-radius: 6px;"
          >
            Reset Password
          </a>
        </p>
        <p>If the button does not work, use this link:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in 1 hour.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `
  });

  return {
    delivered: true
  };
};

module.exports = {
  sendPasswordResetEmail,
  isSmtpConfigured
};
