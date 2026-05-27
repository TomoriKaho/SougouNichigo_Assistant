const express = require('express')
const router = express.Router()
const { User } = require('../models/User')
const { authMiddleware, signUserToken, USER_JWT_EXPIRES_IN } = require('../middleware/auth')

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
