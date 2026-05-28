const express = require('express')
const jwt = require('jsonwebtoken')
const router = express.Router()
const { Feedback, FEEDBACK_TYPES, normalizeFeedbackType } = require('../models/Feedback')
const { User } = require('../models/User')
const { requireEnv } = require('../config/env')

function resolveFeedbackUser(req, res, next) {
  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未登录' })
  }

  const token = authHeader.slice(7)
  const secrets = [requireEnv('USER_JWT_SECRET'), requireEnv('ADMIN_JWT_SECRET')]

  for (const secret of secrets) {
    try {
      const payload = jwt.verify(token, secret)
      const user = User.findRawById(payload.userId)
      if (!user) continue
      req.feedbackUser = user
      req.userId = user.id
      return next()
    } catch (error) {
      // Try the next token scope.
    }
  }

  return res.status(401).json({ success: false, error: '登录已过期' })
}

router.post('/submit', resolveFeedbackUser, (req, res) => {
  const feedbackType = normalizeFeedbackType(req.body.feedback_type || req.body.feedbackType)
  const content = String(req.body.content || '').trim()

  if (!feedbackType) {
    return res.status(400).json({
      success: false,
      error: '请选择反馈类型',
      allowedTypes: FEEDBACK_TYPES
    })
  }

  if (!content) {
    return res.status(400).json({ success: false, error: '请输入反馈内容' })
  }

  const feedbackId = Feedback.create({
    userId: req.userId,
    feedbackType,
    content
  })

  res.json({
    success: true,
    message: '感谢您的反馈',
    feedbackId
  })
})

router.get('/history', resolveFeedbackUser, (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200)
  const feedbackList = Feedback.findByUserId(req.userId, limit)
  res.json({
    success: true,
    feedbackList,
    total: feedbackList.length
  })
})

module.exports = router
