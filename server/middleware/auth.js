const jwt = require('jsonwebtoken')
const { User } = require('../models/User')

const USER_JWT_SECRET = process.env.USER_JWT_SECRET || 'change-user-secret'
const USER_JWT_EXPIRES_IN = process.env.USER_JWT_EXPIRES_IN || '30d'

function signUserToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      userType: user.user_type
    },
    USER_JWT_SECRET,
    { expiresIn: USER_JWT_EXPIRES_IN }
  )
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未登录' })
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), USER_JWT_SECRET)
    const user = User.findById(payload.userId)
    if (!user) {
      return res.status(401).json({ success: false, error: '用户不存在' })
    }
    req.user = user
    req.userId = user.id
    next()
  } catch (error) {
    return res.status(401).json({ success: false, error: '登录已过期' })
  }
}

module.exports = {
  USER_JWT_EXPIRES_IN,
  authMiddleware,
  signUserToken
}
