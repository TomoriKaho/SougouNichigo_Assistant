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

  return getTransporter().sendMail({
    from: smtpConfig().from,
    to: email,
    subject: `総日ナビ${purposeText}验证码`,
    text: [
      `您正在${purposeText}総日ナビ账号。`,
      `验证码：${code}`,
      `验证码 ${expiresMinutes} 分钟内有效，请勿转发给他人。`,
      '如果不是您本人操作，请忽略本邮件。'
    ].join('\n')
  })
}

module.exports = {
  isEmailConfigured,
  sendVerificationCode
}
