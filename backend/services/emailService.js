const nodemailer = require('nodemailer')
const { getEnv } = require('../config/env')

let transporter = null

function smtpConfig() {
  return {
    host: getEnv('SMTP_HOST'),
    port: Number(getEnv('SMTP_PORT', '465')),
    secure: String(getEnv('SMTP_SECURE', 'true')).toLowerCase() !== 'false',
    user: getEnv('SMTP_USER'),
    pass: getEnv('SMTP_PASS'),
    from: getEnv('MAIL_FROM')
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isEmailConfigured() {
  const config = smtpConfig()
  return Boolean(config.host && config.port && config.user && config.pass && config.from)
}

function getTransporter() {
  if (!isEmailConfigured()) {
    const error = new Error('邮件服务未配置，请先设置 SMTP_HOST、SMTP_USER、SMTP_PASS 和 MAIL_FROM')
    error.status = 503
    throw error
  }

  if (!transporter) {
    const config = smtpConfig()
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass
      }
    })
  }

  return transporter
}

async function sendVerificationCode(email, code, purpose) {
  const purposeText = purpose === 'login' ? '登录' : '注册'
  const expiresMinutes = Number(getEnv('EMAIL_CODE_EXPIRES_MINUTES', '10'))
  const safePurposeText = escapeHtml(purposeText)
  const safeCode = escapeHtml(code)
  const safeExpiresMinutes = escapeHtml(expiresMinutes)

  return getTransporter().sendMail({
    from: smtpConfig().from,
    to: email,
    subject: `総日ナビ${purposeText}验证码`,
    text: [
      `您正在${purposeText}総日ナビ账号。`,
      `验证码：${code}`,
      `验证码 ${expiresMinutes} 分钟内有效，请勿转发给他人。`,
      '如果不是您本人操作，请忽略本邮件。'
    ].join('\n'),
    html: `
      <div style="margin:0;padding:24px;background:#f7f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei','PingFang SC',Arial,sans-serif;color:#33261f;">
        <div style="max-width:520px;margin:0 auto;padding:28px 24px;background:#ffffff;border:1px solid #decfbc;border-radius:10px;">
          <h1 style="margin:0 0 16px;color:#8b0012;font-size:22px;line-height:1.3;font-weight:800;">総日ナビ${safePurposeText}验证码</h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;">您正在${safePurposeText}総日ナビ账号，请在页面中输入以下验证码：</p>
          <div style="margin:20px 0;padding:18px 16px;border:2px solid #33261f;border-radius:8px;background:#fffaf4;text-align:center;">
            <div style="font-size:34px;line-height:1.1;font-weight:900;font-family:'Microsoft YaHei','PingFang SC',Arial,sans-serif;letter-spacing:8px;color:#111111;">
              ${safeCode}
            </div>
          </div>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#7b6658;">验证码 ${safeExpiresMinutes} 分钟内有效，请勿转发给他人。</p>
          <p style="margin:0;font-size:14px;line-height:1.7;color:#7b6658;">如果不是您本人操作，请忽略本邮件。</p>
        </div>
      </div>
    `
  })
}

module.exports = {
  isEmailConfigured,
  sendVerificationCode
}
