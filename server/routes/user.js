const express = require('express')
const router = express.Router()
const { User } = require('../models/User')
const { authMiddleware, signUserToken, USER_JWT_EXPIRES_IN } = require('../middleware/auth')

const USERNAME_PATTERN = /^[A-Za-z0-9]{6,15}$/
const PASSWORD_PATTERN = /^[A-Za-z0-9!@#$%^&*()_+\-.]{8,20}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fieldError(res, status, field, message) {
  return res.status(status).json({
    success: false,
    error: message,
    errors: { [field]: message }
  })
}

function validatePassword(value) {
  const password = String(value || '').trim()
  const hasLetter = /[A-Za-z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSymbol = /[!@#$%^&*()_+\-.]/.test(password)
  const categoryCount = [hasLetter, hasNumber, hasSymbol].filter(Boolean).length
  return PASSWORD_PATTERN.test(password) && categoryCount >= 2
}

router.post('/register', (req, res) => {
  const username = String(req.body.username || '').trim()
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '').trim()

  if (!email) return fieldError(res, 400, 'email', '请输入邮箱地址')
  if (!EMAIL_PATTERN.test(email)) return fieldError(res, 400, 'email', '请输入有效的邮箱地址')
  if (!username) return fieldError(res, 400, 'username', '请输入用户名')
  if (!USERNAME_PATTERN.test(username)) return fieldError(res, 400, 'username', '用户名需为6-15位字母或数字组合')
  if (!password) return fieldError(res, 400, 'password', '请输入密码')
  if (!validatePassword(password)) {
    return fieldError(res, 400, 'password', '密码需为8-20位，包含字母、数字、特殊符号中的至少两种')
  }

  if (User.findRawByUsername(username)) return fieldError(res, 409, 'username', '用户名已存在')
  if (User.findRawByEmail(email)) return fieldError(res, 409, 'email', '该邮箱已被注册')

  try {
    const id = User.create({
      username,
      email,
      password,
      role: 'user',
      user_type: 'student'
    })
    const publicUser = User.findById(id)
    res.status(201).json({
      success: true,
      token: signUserToken(User.findRawById(id)),
      expiresIn: USER_JWT_EXPIRES_IN,
      user: publicUser
    })
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        success: false,
        error: '用户名或邮箱已被注册',
        errors: { username: '用户名或邮箱已被注册', email: '用户名或邮箱已被注册' }
      })
    }
    console.error('注册错误:', error)
    return res.status(500).json({ success: false, error: '注册失败，请稍后重试' })
  }
})

router.post('/login', (req, res) => {
  const identifier = String(req.body.identifier || req.body.username || req.body.email || '').trim()
  const password = String(req.body.password || '')

  if (!identifier || !password) {
    return res.status(400).json({ success: false, error: '请输入账号和密码' })
  }

  const user = User.findRawByIdentifier(identifier)
  if (!user || !User.verifyPassword(password, user.password)) {
    return res.status(401).json({ success: false, error: '账号或密码错误' })
  }

  const publicUser = User.findById(user.id)
  res.json({
    success: true,
    token: signUserToken(user),
    expiresIn: USER_JWT_EXPIRES_IN,
    user: publicUser
  })
})

router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user })
})

module.exports = router
