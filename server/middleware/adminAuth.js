const jwt = require('jsonwebtoken')
const { User } = require('../models/User')

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'change-admin-secret'
const ADMIN_JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || '1d'

function toAdminPayload(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    user_type: user.user_type,
    role: user.role,
    isInitialAdmin: !!user.is_initial_admin,
    isInitialDev: !!user.is_initial_dev
  }
}

function signAdminToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      userType: user.user_type
    },
    ADMIN_JWT_SECRET,
    { expiresIn: ADMIN_JWT_EXPIRES_IN }
  )
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权访问' })
  }

  try {
    const token = authHeader.slice(7)
    const payload = jwt.verify(token, ADMIN_JWT_SECRET)
    const user = User.findRawById(payload.userId)
    if (!user || !['dev', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: '无权限访问' })
    }

    req.admin = toAdminPayload(user)
    next()
  } catch (error) {
    return res.status(401).json({ error: '无效的凭证' })
  }
}

module.exports = {
  ADMIN_JWT_EXPIRES_IN,
  requireAdmin,
  signAdminToken,
  toAdminPayload
}
