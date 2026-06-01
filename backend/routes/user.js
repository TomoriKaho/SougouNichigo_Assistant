const express = require('express')
const fs = require('fs')
const router = express.Router()
const { User } = require('../models/User')
const { ReadingMaterial } = require('../models/ReadingMaterial')
const { Grammar } = require('../models/Grammar')
const { Text } = require('../models/Text')
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

function parseLimit(value, fallback = 50, max = 200) {
  const number = Number(value || fallback)
  if (!Number.isFinite(number) || number <= 0) return fallback
  return Math.min(Math.floor(number), max)
}

function parseOffset(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

function streamReadingMaterial(res, item, { view = false } = {}) {
  if (view && !ReadingMaterial.canView(item)) {
    return res.status(400).json({ error: '该文件暂不可在线查看，请下载后打开' })
  }

  const filePath = view ? ReadingMaterial.viewAbsolutePath(item) : ReadingMaterial.fileAbsolutePath(item)
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' })
  }

  const fileName = view ? ReadingMaterial.viewFilename(item) : ReadingMaterial.downloadFilename(item)
  res.setHeader('Content-Type', view ? ReadingMaterial.viewContentType(item) : ReadingMaterial.contentType(item))
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  return fs.createReadStream(filePath).pipe(res)
}

function publicReadingMaterial(row) {
  if (!row) return row
  const {
    stored_filename,
    content_hash,
    created_by,
    preview_file_path,
    conversion_status,
    conversion_error,
    converted_at,
    ...publicItem
  } = row
  return publicItem
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

router.get('/grammar/options', authMiddleware, (req, res) => {
  res.json(Grammar.options())
})

router.get('/grammar', authMiddleware, (req, res) => {
  res.json(Grammar.list({
    limit: parseLimit(req.query.limit, 50, 500),
    offset: parseOffset(req.query.offset),
    keyword: req.query.q || req.query.keyword || '',
    textbookId: req.query.textbookId,
    lessonId: req.query.lessonId,
    lessonNumberMin: req.query.lessonNumberMin || req.query.lesson_number_min,
    lessonNumberMax: req.query.lessonNumberMax || req.query.lesson_number_max,
    unitId: req.query.unitId,
    idOrder: req.query.id_order || req.query.idOrder || 'asc'
  }))
})

router.get('/grammar/:id', authMiddleware, (req, res) => {
  const item = Grammar.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '文法条目不存在' })
  res.json(item)
})

router.get('/texts/options', authMiddleware, (req, res) => {
  res.json(Text.options())
})

router.get('/texts', authMiddleware, (req, res) => {
  res.json(Text.list({
    limit: parseLimit(req.query.limit, 50, 500),
    offset: parseOffset(req.query.offset),
    textbookId: req.query.textbookId,
    idOrder: req.query.id_order || req.query.idOrder || 'asc'
  }))
})

router.get('/reading-materials', authMiddleware, (req, res) => {
  const result = ReadingMaterial.list({
    limit: parseLimit(req.query.limit, 50, 500),
    offset: parseOffset(req.query.offset),
    keyword: req.query.keyword || '',
    idOrder: req.query.id_order || req.query.idOrder || 'desc'
  })
  const baseUrl = `${req.protocol}://${req.get('host')}`
  res.json({
    rows: result.rows.map((row) => publicReadingMaterial({
      ...row,
      view_url: row.can_view ? `${baseUrl}/api/user/reading-materials/open?token=${ReadingMaterial.issueAccessToken(row.id)}` : null
    })),
    total: result.total
  })
})

router.get('/reading-materials/open', (req, res) => {
  const payload = ReadingMaterial.resolveAccessToken(req.query.token)
  if (!payload) return res.status(401).json({ error: '查看链接已失效' })

  const item = ReadingMaterial.findById(payload.id)
  if (!item) return res.status(404).json({ error: '阅读材料不存在' })
  return streamReadingMaterial(res, item, { view: true })
})

router.get('/reading-materials/:id/open-link', authMiddleware, (req, res) => {
  const item = ReadingMaterial.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '阅读材料不存在' })
  if (!ReadingMaterial.canView(item)) return res.status(400).json({ error: '该文件暂不可在线查看，请下载后打开' })

  const token = ReadingMaterial.issueAccessToken(item.id)
  const baseUrl = `${req.protocol}://${req.get('host')}`
  res.json({ url: `${baseUrl}/api/user/reading-materials/open?token=${token}` })
})

router.get('/reading-materials/:id/content', authMiddleware, (req, res) => {
  const item = ReadingMaterial.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '阅读材料不存在' })
  return streamReadingMaterial(res, item)
})

module.exports = router
