const express = require('express')
const fs = require('fs')
const router = express.Router()
const { User, ALLOWED_USER_TYPES, STUDENT_GRADES, isGradeAllowedForUserType, normalizeGrade, normalizeUserType } = require('../models/User')
const { ReadingMaterial } = require('../models/ReadingMaterial')
const { Assignment } = require('../models/Assignment')
const { Grammar } = require('../models/Grammar')
const { Text } = require('../models/Text')
const { TextNote } = require('../models/TextNote')
const { TranslationPractice } = require('../models/TranslationPractice')
const { Vocabulary } = require('../models/Vocabulary')
const { Classroom } = require('../models/Classroom')
const { authMiddleware, signUserToken, USER_JWT_EXPIRES_IN } = require('../middleware/auth')
const assistantService = require('../services/assistantService')
const emailCodeService = require('../services/emailCodeService')
const translationPracticeService = require('../services/translationPracticeService')

const USERNAME_PATTERN = /^[\p{L}\p{N}]{2,15}$/u
const USERNAME_MESSAGE = '用户名需为2-15个字符，仅支持各语言文字'
const PASSWORD_PATTERN = /^[A-Za-z0-9!@#$%^&*()_+\-.]{8,20}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fieldError(res, status, field, message) {
  return res.status(status).json({
    success: false,
    error: message,
    errors: { [field]: message }
  })
}

function serviceFieldError(res, error, fallbackField = 'emailCode') {
  return fieldError(res, error.status || 400, error.field || fallbackField, error.message || '验证码校验失败')
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded || req.ip || req.socket?.remoteAddress || ''
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

function parseFlag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
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

function decodeHeader(value) {
  if (value === undefined || value === null) return ''
  try {
    return decodeURIComponent(String(value || ''))
  } catch (error) {
    return String(value || '')
  }
}

function bodyField(req, key, headerName = key) {
  if (req.body && !Buffer.isBuffer(req.body) && typeof req.body === 'object') {
    return req.body[key]
  }
  return decodeHeader(req.get(headerName))
}

function uploadedFileFromRequest(req) {
  const originalFilename = decodeHeader(req.get('x-file-name'))
  if (!originalFilename) return null
  return {
    originalFilename,
    buffer: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  }
}

function streamAssignmentFile(res, item) {
  const filePath = Assignment.fileAbsolutePath(item)
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' })
  }

  res.setHeader('Content-Type', Assignment.contentType(item))
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(Assignment.downloadFilename(item))}`)
  return fs.createReadStream(filePath).pipe(res)
}

function writeSse(res, event, data) {
  if (res.writableEnded || res.destroyed) return
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
  res.flush?.()
}

function routeError(res, error, fallback = '操作失败') {
  return res.status(error?.status || 500).json({ error: error?.message || fallback })
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

function isReadingMaterialOwner(item, userId) {
  return Number(item?.created_by) === Number(userId)
}

function canModifyClassMaterial(classId, item, userId) {
  return Classroom.canManageMaterials(classId, { userId }) || isReadingMaterialOwner(item, userId)
}

function findClassAssignment(res, classId, assignmentId) {
  const assignment = Assignment.findById(assignmentId)
  if (!assignment || Number(assignment.class_id) !== Number(classId)) {
    res.status(404).json({ error: '作业不存在' })
    return null
  }
  return assignment
}

function validatePassword(value) {
  const password = String(value || '').trim()
  const hasLetter = /[A-Za-z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSymbol = /[!@#$%^&*()_+\-.]/.test(password)
  const categoryCount = [hasLetter, hasNumber, hasSymbol].filter(Boolean).length
  return PASSWORD_PATTERN.test(password) && categoryCount >= 2
}

function requireTeacher(req, res, next) {
  if (req.user?.user_type !== 'teacher') {
    return res.status(403).json({ error: '仅教师用户可执行该操作' })
  }
  next()
}

router.post('/email-code', async (req, res) => {
  const email = emailCodeService.normalizeEmail(req.body.email)
  const purpose = emailCodeService.normalizePurpose(req.body.purpose || 'register')

  if (!email) return fieldError(res, 400, 'email', '请输入邮箱地址')
  if (!EMAIL_PATTERN.test(email)) return fieldError(res, 400, 'email', '请输入有效的邮箱地址')
  if (!emailCodeService.isPkuEmail(email)) return fieldError(res, 400, 'email', '仅支持PKU邮箱')
  if (!purpose) return fieldError(res, 400, 'purpose', '验证码用途无效')

  if (purpose === 'register' && User.findRawByEmail(email)) {
    return fieldError(res, 409, 'email', '该邮箱已被注册')
  }

  if (purpose === 'login' && !User.findRawByEmail(email)) {
    return res.json({
      success: true,
      message: '如果该邮箱已注册，验证码将发送至该邮箱'
    })
  }

  try {
    const result = await emailCodeService.sendCode({
      email,
      purpose,
      ip: clientIp(req)
    })
    res.json({
      success: true,
      expiresIn: result.expiresIn,
      message: '验证码已发送，请查收邮箱'
    })
  } catch (error) {
    if (error.status || error.field) return serviceFieldError(res, error, 'email')
    console.error('发送邮箱验证码失败:', error)
    return res.status(500).json({ success: false, error: '验证码发送失败，请稍后重试' })
  }
})

router.post('/register', (req, res) => {
  const username = String(req.body.username || '').trim()
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '').trim()
  const emailCode = String(req.body.emailCode || req.body.email_code || '').trim()
  const rawUserType = String(req.body.user_type || 'student')
  const userType = normalizeUserType(rawUserType)
  const requestedGrade = String(req.body.grade || '').trim()
  const grade = normalizeGrade(userType, requestedGrade)

  if (!email) return fieldError(res, 400, 'email', '请输入邮箱地址')
  if (!EMAIL_PATTERN.test(email)) return fieldError(res, 400, 'email', '请输入有效的邮箱地址')
  if (!emailCodeService.isPkuEmail(email)) return fieldError(res, 400, 'email', '仅支持PKU邮箱')
  if (!emailCode) return fieldError(res, 400, 'emailCode', '请输入邮箱验证码')
  if (!username) return fieldError(res, 400, 'username', '请输入用户名')
  if (!USERNAME_PATTERN.test(username)) return fieldError(res, 400, 'username', USERNAME_MESSAGE)
  if (!password) return fieldError(res, 400, 'password', '请输入密码')
  if (!ALLOWED_USER_TYPES.includes(rawUserType)) return fieldError(res, 400, 'user_type', '请选择身份')
  if (userType === 'student' && !requestedGrade) return fieldError(res, 400, 'grade', '请选择年级')
  if (!isGradeAllowedForUserType(userType, grade)) {
    const message = userType === 'teacher' ? '教师身份的年级必须为教师' : `学生年级仅支持：${STUDENT_GRADES.join('、')}`
    return fieldError(res, 400, 'grade', message)
  }
  if (!validatePassword(password)) {
    return fieldError(res, 400, 'password', '密码需为8-20位，包含字母、数字、特殊符号中的至少两种')
  }

  if (User.findRawByUsername(username)) return fieldError(res, 409, 'username', '用户名已存在')
  if (User.findRawByEmail(email)) return fieldError(res, 409, 'email', '该邮箱已被注册')

  let verification
  try {
    verification = emailCodeService.verifyCode({ email, purpose: 'register', code: emailCode })
  } catch (error) {
    return serviceFieldError(res, error)
  }

  try {
    const id = User.create({
      username,
      email,
      password,
      role: 'user',
      user_type: userType,
      grade
    })
    emailCodeService.consumeCode(verification.id)
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

router.post('/login/email-code', (req, res) => {
  const email = emailCodeService.normalizeEmail(req.body.email)
  const emailCode = String(req.body.emailCode || req.body.email_code || req.body.code || '').trim()

  if (!email) return fieldError(res, 400, 'email', '请输入邮箱地址')
  if (!EMAIL_PATTERN.test(email)) return fieldError(res, 400, 'email', '请输入有效的邮箱地址')
  if (!emailCodeService.isPkuEmail(email)) return fieldError(res, 400, 'email', '仅支持PKU邮箱')
  if (!emailCode) return fieldError(res, 400, 'emailCode', '请输入邮箱验证码')

  const user = User.findRawByEmail(email)
  if (!user) {
    return res.status(401).json({ success: false, error: '邮箱或验证码错误' })
  }

  let verification
  try {
    verification = emailCodeService.verifyCode({ email, purpose: 'login', code: emailCode })
  } catch (error) {
    return serviceFieldError(res, error)
  }

  emailCodeService.consumeCode(verification.id)
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

router.patch('/me', authMiddleware, (req, res) => {
  const current = User.findRawById(req.user.id)
  if (!current) return res.status(404).json({ success: false, error: '用户不存在' })

  const payload = {}

  if (req.body.username !== undefined) {
    const username = String(req.body.username || '').trim()
    if (!username) return fieldError(res, 400, 'username', '请输入用户名')
    if (!USERNAME_PATTERN.test(username)) return fieldError(res, 400, 'username', USERNAME_MESSAGE)
    const existing = User.findRawByUsername(username)
    if (existing && Number(existing.id) !== Number(req.user.id)) {
      return fieldError(res, 409, 'username', '用户名已存在')
    }
    payload.username = username
  }

  if (req.body.password !== undefined && String(req.body.password || '').trim()) {
    const password = String(req.body.password || '').trim()
    if (!validatePassword(password)) {
      return fieldError(res, 400, 'password', '密码需为8-20位，包含字母、数字、特殊符号中的至少两种')
    }
    payload.password = password
  }

  if (req.body.grade !== undefined) {
    if (current.user_type === 'teacher') {
      return fieldError(res, 400, 'grade', '教师用户无需修改年级')
    }
    const grade = String(req.body.grade || '').trim()
    if (!grade) return fieldError(res, 400, 'grade', '请选择年级')
    if (!isGradeAllowedForUserType(current.user_type, grade)) {
      return fieldError(res, 400, 'grade', `学生年级仅支持：${STUDENT_GRADES.join('、')}`)
    }
    payload.grade = normalizeGrade(current.user_type, grade)
  }

  if (req.body.share_context_chats !== undefined || req.body.shareContextChats !== undefined) {
    payload.share_context_chats = parseFlag(
      req.body.share_context_chats !== undefined ? req.body.share_context_chats : req.body.shareContextChats
    )
  }

  if (!Object.keys(payload).length) {
    return res.status(400).json({ success: false, error: '没有可更新的内容' })
  }

  User.update(req.user.id, payload)
  res.json({ success: true, user: User.findById(req.user.id) })
})

router.post('/assistant/conversations', authMiddleware, (req, res) => {
  const contextType = String(req.body.context_type || req.body.contextType || 'none')
  const contextId = req.body.context_id || req.body.contextId

  if (contextType === 'vocabulary') {
    const result = assistantService.createVocabularyConversation(req.user.id, contextId)
    if (!result) return res.status(404).json({ error: '词条不存在' })
    return res.status(201).json(result)
  }

  if (contextType === 'grammar') {
    const result = assistantService.createGrammarConversation(req.user.id, contextId)
    if (!result) return res.status(404).json({ error: '文法条目不存在' })
    return res.status(201).json(result)
  }

  if (contextType === 'text') {
    return res.status(400).json({ error: '文章提问暂未开放' })
  }

  if (contextType !== 'none') {
    return res.status(400).json({ error: '对话上下文类型无效' })
  }

  return res.status(201).json(assistantService.createFreeConversation(req.user.id))
})

router.get('/assistant/conversations', authMiddleware, (req, res) => {
  res.json(assistantService.listConversations({
    userId: req.user.id,
    contextType: req.query.context_type || req.query.contextType,
    contextId: req.query.context_id || req.query.contextId,
    limit: parseLimit(req.query.limit, 50, 200),
    offset: parseOffset(req.query.offset)
  }))
})

router.get('/assistant/conversations/shared', authMiddleware, (req, res) => {
  res.json(assistantService.listSharedConversations({
    userId: req.user.id,
    contextType: req.query.context_type || req.query.contextType,
    contextId: req.query.context_id || req.query.contextId,
    limit: parseLimit(req.query.limit, 50, 200),
    offset: parseOffset(req.query.offset)
  }))
})

router.get('/assistant/conversations/:id', authMiddleware, (req, res) => {
  const result = assistantService.getConversation(req.user.id, req.params.id)
  if (!result) return res.status(404).json({ error: '对话不存在' })
  res.json(result)
})

router.delete('/assistant/conversations/:id', authMiddleware, (req, res) => {
  const deleted = assistantService.deleteConversation(req.user.id, req.params.id)
  if (!deleted) return res.status(404).json({ error: '对话不存在' })
  res.json({ success: true })
})

router.patch('/assistant/conversations/:id/title', authMiddleware, (req, res) => {
  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ error: '标题不能为空' })
  const conversation = assistantService.renameConversation(req.user.id, req.params.id, title)
  if (!conversation) return res.status(404).json({ error: '对话不存在' })
  res.json({ success: true, conversation })
})

router.post('/assistant/conversations/:id/messages/stream', authMiddleware, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
  writeSse(res, 'ping', { ts: Date.now(), phase: 'connected' })
  const heartbeat = setInterval(() => {
    writeSse(res, 'ping', { ts: Date.now() })
  }, 2000)

  res.on('close', () => {
    clearInterval(heartbeat)
  })

  try {
    const result = await assistantService.streamAssistantReply({
      userId: req.user.id,
      conversationId: req.params.id,
      content: req.body.content,
      templateKey: req.body.template_key || req.body.templateKey,
      forceWebSearch: parseFlag(req.body.force_web_search || req.body.forceWebSearch),
      onDelta: (content) => writeSse(res, 'delta', { content })
    })
    writeSse(res, 'done', result)
  } catch (error) {
    writeSse(res, 'error', {
      error: error.message || 'AI 回复失败',
      status: error.status || 500
    })
  } finally {
    clearInterval(heartbeat)
    res.end()
  }
})

router.post('/assistant/context/vocabulary/:id', authMiddleware, (req, res) => {
  const result = assistantService.createVocabularyConversation(req.user.id, req.params.id)
  if (!result) return res.status(404).json({ error: '词条不存在' })
  res.status(201).json(result)
})

router.post('/assistant/context/grammar/:id', authMiddleware, (req, res) => {
  const result = assistantService.createGrammarConversation(req.user.id, req.params.id)
  if (!result) return res.status(404).json({ error: '文法条目不存在' })
  res.status(201).json(result)
})

router.post('/assistant/context/text/:id/selection', authMiddleware, (req, res) => {
  try {
    const result = assistantService.createTextSelectionConversation(req.user.id, req.params.id, req.body)
    if (!result) return res.status(404).json({ error: '课文条目不存在' })
    res.status(201).json(result)
  } catch (error) {
    routeError(res, error, '打开课文提问失败')
  }
})

router.get('/grammar/options', authMiddleware, (req, res) => {
  res.json(Grammar.options())
})

router.get('/grammar', authMiddleware, (req, res) => {
  res.json(Grammar.list({
    limit: parseLimit(req.query.limit, 50, 500),
    offset: parseOffset(req.query.offset),
    keyword: req.query.q || req.query.keyword || '',
    userId: req.user.id,
    favoritesOnly: parseFlag(req.query.favoritesOnly || req.query.favorites_only),
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

router.post('/grammar/:id/favorite', authMiddleware, (req, res) => {
  const item = Grammar.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '文法条目不存在' })
  Grammar.setFavorite(req.user.id, req.params.id, true)
  res.json({ success: true, isFavorite: true })
})

router.delete('/grammar/:id/favorite', authMiddleware, (req, res) => {
  const item = Grammar.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '文法条目不存在' })
  Grammar.setFavorite(req.user.id, req.params.id, false)
  res.json({ success: true, isFavorite: false })
})

router.get('/vocabulary/options', authMiddleware, (req, res) => {
  res.json(Vocabulary.options())
})

router.get('/vocabulary', authMiddleware, (req, res) => {
  res.json(Vocabulary.list({
    limit: parseLimit(req.query.limit, 50, 500),
    offset: parseOffset(req.query.offset),
    keyword: req.query.q || req.query.keyword || '',
    userId: req.user.id,
    favoritesOnly: parseFlag(req.query.favoritesOnly || req.query.favorites_only),
    keyOnly: parseFlag(req.query.keyOnly || req.query.key_only),
    textbookId: req.query.textbookId,
    lessonId: req.query.lessonId,
    lessonNumberMin: req.query.lessonNumberMin || req.query.lesson_number_min,
    lessonNumberMax: req.query.lessonNumberMax || req.query.lesson_number_max,
    unitId: req.query.unitId,
    tableType: req.query.tableType || 'all',
    idOrder: req.query.id_order || req.query.idOrder || 'asc'
  }))
})

router.post('/vocabulary/:id/favorite', authMiddleware, (req, res) => {
  const item = Vocabulary.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '词条不存在' })
  Vocabulary.setFavorite(req.user.id, req.params.id, true)
  res.json({ success: true, isFavorite: true })
})

router.delete('/vocabulary/:id/favorite', authMiddleware, (req, res) => {
  const item = Vocabulary.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '词条不存在' })
  Vocabulary.setFavorite(req.user.id, req.params.id, false)
  res.json({ success: true, isFavorite: false })
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

router.get('/texts/:id/study', authMiddleware, (req, res) => {
  const result = Text.studyById(req.params.id, req.user.id)
  if (!result) return res.status(404).json({ error: '课文条目不存在' })
  res.json(result)
})

router.get('/texts/:id/notes', authMiddleware, (req, res) => {
  const item = Text.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '课文条目不存在' })
  res.json({ rows: TextNote.listForText(req.user.id, req.params.id) })
})

router.post('/texts/:id/notes', authMiddleware, (req, res) => {
  try {
    const item = TextNote.create(req.user.id, req.params.id, req.body)
    res.status(201).json({ success: true, item })
  } catch (error) {
    routeError(res, error, '保存笔记失败')
  }
})

router.patch('/text-notes/:id', authMiddleware, (req, res) => {
  try {
    const item = TextNote.update(req.user.id, req.params.id, req.body)
    if (!item) return res.status(404).json({ error: '笔记不存在' })
    res.json({ success: true, item })
  } catch (error) {
    routeError(res, error, '更新笔记失败')
  }
})

router.delete('/text-notes/:id', authMiddleware, (req, res) => {
  const deleted = TextNote.delete(req.user.id, req.params.id)
  if (!deleted) return res.status(404).json({ error: '笔记不存在' })
  res.json({ success: true })
})

router.get('/translation-practice/options', authMiddleware, (req, res) => {
  try {
    res.json(translationPracticeService.listRangeOptions())
  } catch (error) {
    routeError(res, error, '获取翻译练习选项失败')
  }
})

router.get('/translation-practices', authMiddleware, (req, res) => {
  res.json(TranslationPractice.listOwned({
    userId: req.user.id,
    limit: parseLimit(req.query.limit, 20, 100),
    offset: parseOffset(req.query.offset)
  }))
})

router.get('/translation-practices/:id', authMiddleware, (req, res) => {
  const item = TranslationPractice.findOwnedById(req.params.id, req.user.id, { includeMessages: true })
  if (!item) return res.status(404).json({ error: '练习记录不存在' })
  res.json({ item })
})

router.post('/translation-practices/generate', authMiddleware, async (req, res) => {
  try {
    const item = await translationPracticeService.generatePractice({
      userId: req.user.id,
      rangeKey: req.body.range_key || req.body.rangeKey || 'upper',
      directionMode: req.body.direction_mode || req.body.directionMode || 'jp_to_zh'
    })
    res.status(201).json({ item })
  } catch (error) {
    routeError(res, error, '生成翻译练习失败')
  }
})

router.post('/translation-practices/:id/submit', authMiddleware, async (req, res) => {
  try {
    const item = await translationPracticeService.submitPractice({
      userId: req.user.id,
      practiceId: req.params.id,
      answers: req.body.answers || {}
    })
    res.json({ item })
  } catch (error) {
    routeError(res, error, '批改翻译练习失败')
  }
})

router.patch('/translation-practices/:id/answers', authMiddleware, async (req, res) => {
  try {
    const item = await translationPracticeService.savePracticeAnswers({
      userId: req.user.id,
      practiceId: req.params.id,
      answers: req.body.answers || {}
    })
    res.json({ item })
  } catch (error) {
    routeError(res, error, '保存翻译答案失败')
  }
})

router.post('/translation-practices/:id/messages', authMiddleware, async (req, res) => {
  try {
    const result = await translationPracticeService.askPractice({
      userId: req.user.id,
      practiceId: req.params.id,
      content: req.body.content
    })
    res.status(201).json(result)
  } catch (error) {
    routeError(res, error, '追问失败')
  }
})

router.get('/classes', authMiddleware, (req, res) => {
  res.json(Classroom.listForUser({
    userId: req.user.id,
    limit: parseLimit(req.query.limit, 50, 500),
    offset: parseOffset(req.query.offset)
  }))
})

router.post('/classes', authMiddleware, requireTeacher, (req, res) => {
  try {
    const item = Classroom.create({
      teacherUserId: req.user.id,
      name: req.body.name,
      allowStudentUploads: parseFlag(req.body.allow_student_uploads ?? req.body.allowStudentUploads)
    })
    res.status(201).json({ success: true, item })
  } catch (error) {
    if (String(error?.message || '').includes('班级名不能为空')) {
      return res.status(400).json({ error: '请输入班级名' })
    }
    if (String(error?.message || '').includes('班级名称不得超过20个字')) {
      return res.status(400).json({ error: '班级名称不得超过20个字' })
    }
    console.error(error)
    return res.status(500).json({ error: '创建班级失败' })
  }
})

router.post('/classes/join', authMiddleware, (req, res) => {
  try {
    const item = Classroom.joinByCode({
      userId: req.user.id,
      userType: req.user.user_type,
      code: req.body.code
    })
    res.status(201).json({ success: true, item })
  } catch (error) {
    if (error.code === 'CLASS_NOT_FOUND') {
      return res.status(404).json({ error: '班级码不存在' })
    }
    if (error.code === 'CLASS_ALREADY_JOINED') {
      return res.status(409).json({ error: '您已加入该班级' })
    }
    if (error.code === 'CLASS_SELF_JOIN') {
      return res.status(400).json({ error: '不能加入自己创建的班级' })
    }
    if (String(error?.message || '').includes('班级码不能为空')) {
      return res.status(400).json({ error: '请输入班级码' })
    }
    console.error(error)
    return res.status(500).json({ error: '加入班级失败' })
  }
})

router.get('/classes/:id', authMiddleware, (req, res) => {
  const item = Classroom.findForUser(req.params.id, {
    userId: req.user.id
  })
  if (!item) return res.status(404).json({ error: '班级不存在或无权访问' })
  res.json(item)
})

router.put('/classes/:id', authMiddleware, requireTeacher, (req, res) => {
  const item = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!item) return res.status(404).json({ error: '班级不存在或无权访问' })

  try {
    let changed = false

    if (req.body.name !== undefined) {
      if (!item.is_creator) return res.status(403).json({ error: '仅创建者可修改班级名称' })
      const result = Classroom.updateName({
        classId: req.params.id,
        teacherUserId: req.user.id,
        name: req.body.name
      })
      if (!result.changes) return res.status(404).json({ error: '班级不存在或无权访问' })
      changed = true
    }

    if (req.body.allow_student_uploads !== undefined || req.body.allowStudentUploads !== undefined) {
      const result = Classroom.updateStudentUploadPermission({
        classId: req.params.id,
        teacherUserId: req.user.id,
        allowStudentUploads: parseFlag(req.body.allow_student_uploads ?? req.body.allowStudentUploads)
      })
      if (!result.changes) {
        if (result.reason === 'forbidden') return res.status(403).json({ error: '仅班级内教师可修改学生上传权限' })
        return res.status(404).json({ error: '班级不存在或无权访问' })
      }
      changed = true
    }

    if (!changed) return res.status(400).json({ error: '没有可更新的内容' })
    res.json({ success: true })
  } catch (error) {
    if (String(error?.message || '').includes('班级名不能为空')) {
      return res.status(400).json({ error: '请输入班级名' })
    }
    if (String(error?.message || '').includes('班级名称不得超过20个字')) {
      return res.status(400).json({ error: '班级名称不得超过20个字' })
    }
    console.error(error)
    return res.status(500).json({ error: '修改班级名称失败' })
  }
})

router.delete('/classes/:id/members/:userId', authMiddleware, requireTeacher, (req, res) => {
  const item = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!item) return res.status(404).json({ error: '班级不存在或无权访问' })
  if (!item.is_creator) return res.status(403).json({ error: '仅创建者可移除学生' })

  const result = Classroom.removeStudent({
    classId: req.params.id,
    teacherUserId: req.user.id,
    studentUserId: req.params.userId
  })

  if (!result.changes) {
    if (result.reason === 'not-student') return res.status(400).json({ error: '只能移除学生成员' })
    return res.status(404).json({ error: '学生成员不存在' })
  }

  res.json({ success: true })
})

router.delete('/classes/:id', authMiddleware, requireTeacher, (req, res) => {
  const item = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!item) return res.status(404).json({ error: '班级不存在或无权访问' })
  if (!item.is_creator) return res.status(403).json({ error: '仅创建者可解散班级' })

  const result = Classroom.dissolve({
    classId: req.params.id,
    teacherUserId: req.user.id
  })
  if (!result.changes) return res.status(404).json({ error: '班级不存在或无权访问' })
  res.json({ success: true })
})

router.get('/classes/:id/assignments', authMiddleware, (req, res) => {
  const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })

  const result = Assignment.list({
    classId: req.params.id,
    userId: req.user.id,
    limit: parseLimit(req.query.limit, 50, 500),
    offset: parseOffset(req.query.offset),
    keyword: req.query.keyword || '',
    idOrder: req.query.id_order || req.query.idOrder || 'desc',
    submissionOrder: req.query.submission_order || req.query.submissionOrder || ''
  })

  res.json({
    rows: result.rows,
    total: result.total,
    canManage: Classroom.canManageMaterials(req.params.id, { userId: req.user.id })
  })
})

router.post(
  '/classes/:id/assignments',
  authMiddleware,
  express.raw({ type: '*/*', limit: '200mb' }),
  (req, res) => {
    const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
    if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })
    if (!Classroom.canManageMaterials(req.params.id, { userId: req.user.id })) {
      return res.status(403).json({ error: '仅班级内教师可布置作业' })
    }

    try {
      const isPublic = req.body && !Buffer.isBuffer(req.body) && typeof req.body === 'object'
        ? parseFlag(req.body.is_public ?? req.body.isPublic)
        : parseFlag(req.get('x-assignment-public'))
      const id = Assignment.create({
        classId: req.params.id,
        title: bodyField(req, 'title', 'x-assignment-title'),
        content: bodyField(req, 'content', 'x-assignment-content'),
        isPublic,
        createdBy: req.user.id,
        file: uploadedFileFromRequest(req)
      })
      res.status(201).json({ id })
    } catch (error) {
      return res.status(400).json({ error: error.message || '创建作业失败' })
    }
  }
)

router.get('/classes/:id/assignments/:assignmentId', authMiddleware, (req, res) => {
  const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })

  const assignment = findClassAssignment(res, req.params.id, req.params.assignmentId)
  if (!assignment) return

  const canManage = Classroom.canManageMaterials(req.params.id, { userId: req.user.id })
  const submissions = canManage
    ? []
    : Assignment.listSubmissions({
      assignmentId: assignment.id,
      viewerUserId: req.user.id,
      canManage,
      includePublic: !!assignment.is_public
    })
  const studentSubmissions = canManage
    ? Assignment.listStudentSubmissionSummaries({
      classId: req.params.id,
      assignmentId: assignment.id,
      viewerUserId: req.user.id
    })
    : []

  res.json({
    assignment,
    submissions,
    student_submissions: studentSubmissions,
    canManage
  })
})

router.put(
  '/classes/:id/assignments/:assignmentId',
  authMiddleware,
  express.raw({ type: '*/*', limit: '200mb' }),
  (req, res) => {
    const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
    if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })
    if (!Classroom.canManageMaterials(req.params.id, { userId: req.user.id })) {
      return res.status(403).json({ error: '仅班级内教师可编辑作业' })
    }

    const assignment = findClassAssignment(res, req.params.id, req.params.assignmentId)
    if (!assignment) return

    try {
      const isPublic = req.body && !Buffer.isBuffer(req.body) && typeof req.body === 'object'
        ? parseFlag(req.body.is_public ?? req.body.isPublic)
        : parseFlag(req.get('x-assignment-public'))
      Assignment.update(assignment.id, {
        title: bodyField(req, 'title', 'x-assignment-title'),
        content: bodyField(req, 'content', 'x-assignment-content'),
        isPublic,
        file: {
          ...uploadedFileFromRequest(req),
          createdBy: req.user.id
        }
      })
      res.json({ success: true })
    } catch (error) {
      return res.status(400).json({ error: error.message || '编辑作业失败' })
    }
  }
)

router.delete('/classes/:id/assignments/:assignmentId', authMiddleware, (req, res) => {
  const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })
  if (!Classroom.canManageMaterials(req.params.id, { userId: req.user.id })) {
    return res.status(403).json({ error: '仅班级内教师可删除作业' })
  }

  const assignment = findClassAssignment(res, req.params.id, req.params.assignmentId)
  if (!assignment) return
  Assignment.delete(assignment.id)
  res.json({ success: true })
})

router.post(
  '/classes/:id/assignments/:assignmentId/submissions',
  authMiddleware,
  express.raw({ type: '*/*', limit: '200mb' }),
  (req, res) => {
    const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
    if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })
    if (classroom.member_role === 'teacher') return res.status(403).json({ error: '教师无需提交作业' })

    const assignment = findClassAssignment(res, req.params.id, req.params.assignmentId)
    if (!assignment) return

    try {
      const id = Assignment.createSubmission({
        assignmentId: assignment.id,
        userId: req.user.id,
        textContent: bodyField(req, 'text_content', 'x-submission-content') ?? bodyField(req, 'textContent', 'x-submission-content'),
        file: uploadedFileFromRequest(req)
      })
      res.status(201).json({ id })
    } catch (error) {
      return res.status(400).json({ error: error.message || '提交作业失败' })
    }
  }
)

router.post(
  '/classes/:id/assignments/:assignmentId/submissions/:submissionId/feedback',
  authMiddleware,
  express.raw({ type: '*/*', limit: '200mb' }),
  (req, res) => {
    const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
    if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })
    if (!Classroom.canManageMaterials(req.params.id, { userId: req.user.id })) {
      return res.status(403).json({ error: '仅班级内教师可反馈作业' })
    }

    const assignment = findClassAssignment(res, req.params.id, req.params.assignmentId)
    if (!assignment) return
    const submission = Assignment.findSubmission(req.params.submissionId)
    if (!submission || Number(submission.assignment_id) !== Number(assignment.id)) {
      return res.status(404).json({ error: '提交记录不存在' })
    }

    try {
      const id = Assignment.upsertFeedback({
        assignmentId: assignment.id,
        submissionId: submission.id,
        studentUserId: submission.user_id,
        teacherUserId: req.user.id,
        textContent: bodyField(req, 'text_content', 'x-feedback-content') ?? bodyField(req, 'textContent', 'x-feedback-content'),
        file: uploadedFileFromRequest(req)
      })
      res.status(201).json({ id })
    } catch (error) {
      return res.status(400).json({ error: error.message || '保存反馈失败' })
    }
  }
)

router.get('/classes/:id/assignments/files/:fileId/content', authMiddleware, (req, res) => {
  const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })

  const item = Assignment.findAssignmentFile(req.params.fileId)
  if (!item) return res.status(404).json({ error: '文件不存在' })
  const assignment = findClassAssignment(res, req.params.id, item.assignment_id)
  if (!assignment) return
  return streamAssignmentFile(res, item)
})

router.get('/classes/:id/assignments/submission-files/:fileId/content', authMiddleware, (req, res) => {
  const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })

  const item = Assignment.findSubmissionFile(req.params.fileId)
  if (!item) return res.status(404).json({ error: '文件不存在' })
  const assignment = findClassAssignment(res, req.params.id, item.assignment_id)
  if (!assignment) return

  const canManage = Classroom.canManageMaterials(req.params.id, { userId: req.user.id })
  const canAccessFile = canManage || assignment.is_public || Number(item.user_id) === Number(req.user.id)
  if (!canAccessFile) return res.status(403).json({ error: '无权访问该提交文件' })
  return streamAssignmentFile(res, item)
})

router.get('/classes/:id/assignments/feedback-files/:fileId/content', authMiddleware, (req, res) => {
  const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })

  const item = Assignment.findFeedbackFile(req.params.fileId)
  if (!item) return res.status(404).json({ error: '文件不存在' })
  const assignment = findClassAssignment(res, req.params.id, item.assignment_id)
  if (!assignment) return

  const canManage = Classroom.canManageMaterials(req.params.id, { userId: req.user.id })
  const canAccessFile = canManage || Number(item.student_user_id) === Number(req.user.id)
  if (!canAccessFile) return res.status(403).json({ error: '无权访问该反馈文件' })
  return streamAssignmentFile(res, item)
})

router.get('/classes/:id/materials', authMiddleware, (req, res) => {
  const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })

  const result = ReadingMaterial.list({
    classId: req.params.id,
    limit: parseLimit(req.query.limit, 50, 500),
    offset: parseOffset(req.query.offset),
    keyword: req.query.keyword || '',
    idOrder: req.query.id_order || req.query.idOrder || 'desc'
  })
  const baseUrl = `${req.protocol}://${req.get('host')}`
  const canManage = Classroom.canManageMaterials(req.params.id, { userId: req.user.id })
  res.json({
    rows: result.rows.map((row) => {
      const canModify = canManage || isReadingMaterialOwner(row, req.user.id)
      return publicReadingMaterial({
        ...row,
        can_edit: canModify,
        can_delete: canModify,
        view_url: row.can_view ? `${baseUrl}/api/user/classes/${req.params.id}/materials/open?token=${ReadingMaterial.issueAccessToken(row.id)}` : null
      })
    }),
    total: result.total,
    canManage,
    canUpload: Classroom.canUploadMaterials(req.params.id, { userId: req.user.id })
  })
})

router.post(
  '/classes/:id/materials/upload',
  authMiddleware,
  express.raw({ type: '*/*', limit: '200mb' }),
  (req, res) => {
    const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
    if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })
    if (!Classroom.canUploadMaterials(req.params.id, { userId: req.user.id })) {
      return res.status(403).json({ error: '当前班级未开放学生上传课程资料' })
    }

    try {
      const originalFilename = decodeURIComponent(String(req.get('x-file-name') || ''))
      const title = decodeURIComponent(String(req.get('x-title') || ''))
      const id = ReadingMaterial.create({
        classId: req.params.id,
        title,
        originalFilename,
        buffer: req.body,
        createdBy: req.user.id
      })
      res.status(201).json({ id })
    } catch (error) {
      return res.status(400).json({ error: error.message || '上传失败' })
    }
  }
)

router.get('/classes/:id/materials/open', (req, res) => {
  const payload = ReadingMaterial.resolveAccessToken(req.query.token)
  if (!payload) return res.status(401).json({ error: '查看链接已失效' })

  const item = ReadingMaterial.findById(payload.id)
  if (!item || Number(item.class_id) !== Number(req.params.id)) {
    return res.status(404).json({ error: '课程资料不存在' })
  }
  return streamReadingMaterial(res, item, { view: true })
})

router.get('/classes/:id/materials/:materialId/open-link', authMiddleware, (req, res) => {
  const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })

  const item = ReadingMaterial.findById(req.params.materialId)
  if (!item || Number(item.class_id) !== Number(req.params.id)) {
    return res.status(404).json({ error: '课程资料不存在' })
  }
  if (!ReadingMaterial.canView(item)) return res.status(400).json({ error: '该文件暂不可在线查看，请下载后打开' })

  const token = ReadingMaterial.issueAccessToken(item.id)
  const baseUrl = `${req.protocol}://${req.get('host')}`
  res.json({ url: `${baseUrl}/api/user/classes/${req.params.id}/materials/open?token=${token}` })
})

router.get('/classes/:id/materials/:materialId/content', authMiddleware, (req, res) => {
  const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })

  const item = ReadingMaterial.findById(req.params.materialId)
  if (!item || Number(item.class_id) !== Number(req.params.id)) {
    return res.status(404).json({ error: '课程资料不存在' })
  }
  return streamReadingMaterial(res, item)
})

router.put('/classes/:id/materials/:materialId', authMiddleware, (req, res) => {
  const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })

  const item = ReadingMaterial.findById(req.params.materialId)
  if (!item || Number(item.class_id) !== Number(req.params.id)) {
    return res.status(404).json({ error: '课程资料不存在' })
  }
  if (!canModifyClassMaterial(req.params.id, item, req.user.id)) {
    return res.status(403).json({ error: '仅班级内教师或上传者本人可编辑课程资料' })
  }

  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ error: '标题不能为空' })
  ReadingMaterial.update(req.params.materialId, { title })
  res.json({ success: true })
})

router.delete('/classes/:id/materials/:materialId', authMiddleware, (req, res) => {
  const classroom = Classroom.findForUser(req.params.id, { userId: req.user.id })
  if (!classroom) return res.status(404).json({ error: '班级不存在或无权访问' })

  const item = ReadingMaterial.findById(req.params.materialId)
  if (!item || Number(item.class_id) !== Number(req.params.id)) {
    return res.status(404).json({ error: '课程资料不存在' })
  }
  if (!canModifyClassMaterial(req.params.id, item, req.user.id)) {
    return res.status(403).json({ error: '仅班级内教师或上传者本人可删除课程资料' })
  }
  ReadingMaterial.delete(req.params.materialId)
  res.json({ success: true })
})

module.exports = router
