const express = require('express')
const router = express.Router()
const Feedback = require('../models/Feedback')
const { authMiddleware } = require('../middleware/auth')

router.post('/submit', authMiddleware, (req, res) => {
  const satisfaction = Number(req.body.satisfaction)
  const comment = String(req.body.comment || '').trim()

  if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 4) {
    return res.status(400).json({ success: false, error: '满意度评分必须在 1-4 之间' })
  }

  const feedbackId = Feedback.create({
    userId: req.userId,
    username: req.user.username || '',
    satisfaction,
    comment: comment || null
  })

  res.json({
    success: true,
    message: '感谢您的反馈',
    feedbackId
  })
})

router.get('/history', authMiddleware, (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200)
  const feedbackList = Feedback.findByUserId(req.userId, limit)
  res.json({
    success: true,
    feedbackList,
    total: feedbackList.length
  })
})

module.exports = router
