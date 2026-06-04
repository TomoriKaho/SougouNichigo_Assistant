const crypto = require('crypto')
const { userDb } = require('../database/db')
const { getEnv } = require('../config/env')
const emailService = require('./emailService')

const ALLOWED_PURPOSES = ['register', 'login']

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function isPkuEmail(email) {
  const value = normalizeEmail(email)
  const atIndex = value.lastIndexOf('@')
  if (atIndex <= 0) return false
  const domain = value.slice(atIndex + 1)
  return domain === 'pku.edu.cn' || domain.endsWith('.pku.edu.cn')
}

function normalizePurpose(purpose) {
  const value = String(purpose || '').trim().toLowerCase()
  return ALLOWED_PURPOSES.includes(value) ? value : ''
}

function nowIso() {
  return new Date().toISOString()
}

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

function secondsAgo(seconds) {
  return new Date(Date.now() - seconds * 1000).toISOString()
}

function makeServiceError(message, status = 400, field = 'emailCode') {
  const error = new Error(message)
  error.status = status
  error.field = field
  return error
}

function secret() {
  return getEnv('EMAIL_CODE_SECRET', getEnv('USER_JWT_SECRET', 'sounichinavi-email-code-secret'))
}

function hashCode(email, purpose, code) {
  return crypto
    .createHmac('sha256', secret())
    .update(`${normalizeEmail(email)}:${normalizePurpose(purpose)}:${String(code || '').trim()}`)
    .digest('hex')
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000))
}

function cleanupExpiredCodes() {
  userDb.prepare(`
    DELETE FROM email_verification_codes
    WHERE consumed_at IS NOT NULL OR expires_at < ?
  `).run(secondsAgo(Number(getEnv('EMAIL_CODE_KEEP_SECONDS', '86400'))))
}

function enforceRateLimit(email, purpose, ip) {
  const resendSeconds = Number(getEnv('EMAIL_CODE_RESEND_SECONDS', '60'))
  const perEmailHour = Number(getEnv('EMAIL_CODE_MAX_PER_EMAIL_HOUR', '5'))
  const perIpHour = Number(getEnv('EMAIL_CODE_MAX_PER_IP_HOUR', '30'))
  const recentCutoff = secondsAgo(resendSeconds)
  const hourCutoff = secondsAgo(3600)

  const recent = userDb.prepare(`
    SELECT id FROM email_verification_codes
    WHERE email = ? AND purpose = ? AND created_at > ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(email, purpose, recentCutoff)
  if (recent) {
    throw makeServiceError(`验证码发送过于频繁，请 ${resendSeconds} 秒后再试`, 429, 'email')
  }

  const emailCount = userDb.prepare(`
    SELECT COUNT(*) AS total FROM email_verification_codes
    WHERE email = ? AND purpose = ? AND created_at > ?
  `).get(email, purpose, hourCutoff).total
  if (emailCount >= perEmailHour) {
    throw makeServiceError('该邮箱请求验证码过于频繁，请稍后再试', 429, 'email')
  }

  if (ip) {
    const ipCount = userDb.prepare(`
      SELECT COUNT(*) AS total FROM email_verification_codes
      WHERE request_ip = ? AND created_at > ?
    `).get(ip, hourCutoff).total
    if (ipCount >= perIpHour) {
      throw makeServiceError('当前网络请求验证码过于频繁，请稍后再试', 429, 'email')
    }
  }
}

async function sendCode({ email, purpose, ip }) {
  const normalizedEmail = normalizeEmail(email)
  const normalizedPurpose = normalizePurpose(purpose)
  if (!normalizedPurpose) throw makeServiceError('验证码用途无效', 400, 'purpose')

  cleanupExpiredCodes()
  enforceRateLimit(normalizedEmail, normalizedPurpose, ip)

  const code = generateCode()
  const expiresMinutes = Number(getEnv('EMAIL_CODE_EXPIRES_MINUTES', '10'))
  const result = userDb.prepare(`
    INSERT INTO email_verification_codes (
      email,
      purpose,
      code_hash,
      expires_at,
      request_ip,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    normalizedEmail,
    normalizedPurpose,
    hashCode(normalizedEmail, normalizedPurpose, code),
    minutesFromNow(expiresMinutes),
    ip || null,
    nowIso()
  )

  try {
    await emailService.sendVerificationCode(normalizedEmail, code, normalizedPurpose)
  } catch (error) {
    userDb.prepare('DELETE FROM email_verification_codes WHERE id = ?').run(result.lastInsertRowid)
    throw error
  }

  return { expiresIn: expiresMinutes * 60 }
}

function verifyCode({ email, purpose, code }) {
  const normalizedEmail = normalizeEmail(email)
  const normalizedPurpose = normalizePurpose(purpose)
  const normalizedCode = String(code || '').trim()
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw makeServiceError('请输入6位邮箱验证码', 400, 'emailCode')
  }

  const record = userDb.prepare(`
    SELECT * FROM email_verification_codes
    WHERE email = ? AND purpose = ? AND consumed_at IS NULL
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(normalizedEmail, normalizedPurpose)

  if (!record) throw makeServiceError('请先获取邮箱验证码', 400, 'emailCode')
  if (Number(record.attempt_count || 0) >= Number(getEnv('EMAIL_CODE_MAX_ATTEMPTS', '5'))) {
    throw makeServiceError('验证码错误次数过多，请重新获取', 429, 'emailCode')
  }
  if (record.expires_at < nowIso()) {
    throw makeServiceError('验证码已过期，请重新获取', 400, 'emailCode')
  }

  const expected = hashCode(normalizedEmail, normalizedPurpose, normalizedCode)
  if (record.code_hash !== expected) {
    userDb.prepare(`
      UPDATE email_verification_codes
      SET attempt_count = attempt_count + 1
      WHERE id = ?
    `).run(record.id)
    throw makeServiceError('邮箱验证码错误', 400, 'emailCode')
  }

  return record
}

function consumeCode(id) {
  return userDb.prepare(`
    UPDATE email_verification_codes
    SET consumed_at = ?
    WHERE id = ? AND consumed_at IS NULL
  `).run(nowIso(), id)
}

module.exports = {
  isPkuEmail,
  normalizeEmail,
  normalizePurpose,
  sendCode,
  verifyCode,
  consumeCode
}
