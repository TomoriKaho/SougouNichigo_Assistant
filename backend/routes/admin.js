const express = require('express')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const AdmZip = require('adm-zip')
const router = express.Router()
const { requireAdmin, signAdminToken, ADMIN_JWT_EXPIRES_IN } = require('../middleware/adminAuth')
const { dataDir, dbPaths } = require('../database/db')
const {
  User,
  ALLOWED_ROLES,
  ALLOWED_USER_TYPES,
  STUDENT_GRADES,
  isGradeAllowedForUserType,
  normalizeGrade,
  normalizeUserType
} = require('../models/User')
const { Vocabulary } = require('../models/Vocabulary')
const { Grammar } = require('../models/Grammar')
const { Text } = require('../models/Text')
const { ReadingMaterial } = require('../models/ReadingMaterial')
const { Feedback, FEEDBACK_TYPES } = require('../models/Feedback')

const BACKUP_DIR = path.join(dataDir, 'backups')
const BACKUP_RECORDS_FILE = path.join(dataDir, 'backup_records.json')
const IMPORT_RECORDS_FILE = path.join(dataDir, 'import_records.json')
const DOWNLOAD_TOKEN_TTL_MS = 5 * 60 * 1000
const downloadTokens = new Map()

function isDev(req) {
  return req.admin?.role === 'dev'
}

function forbid(res, message = '无权限') {
  return res.status(403).json({ error: message })
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

function handleDbError(res, error, fallback = '操作失败') {
  if (String(error?.message || '').includes('UNIQUE constraint failed')) {
    return res.status(409).json({ error: '存在重复数据，请检查用户名、邮箱或唯一字段' })
  }
  console.error(error)
  return res.status(500).json({ error: fallback })
}

function canAdminAccessTarget(req, target) {
  if (isDev(req)) return true
  return target && target.role !== 'dev' && !target.is_initial_dev
}

function getAllowedFiles() {
  return [
    {
      key: 'user_data',
      label: 'user_data.db',
      fileName: 'user_data.db',
      path: dbPaths.user
    },
    {
      key: 'vocabulary',
      label: 'vocabulary.db',
      fileName: 'vocabulary.db',
      path: dbPaths.vocabulary
    },
    {
      key: 'grammar',
      label: 'grammar.db',
      fileName: 'grammar.db',
      path: dbPaths.grammar
    },
    {
      key: 'text',
      label: 'text.db',
      fileName: 'text.db',
      path: dbPaths.text
    },
    {
      key: 'reading_materials',
      label: 'reading_materials.db',
      fileName: 'reading_materials.db',
      path: dbPaths.readingMaterials
    },
    {
      key: 'feedback',
      label: 'feedback.db',
      fileName: 'feedback.db',
      path: dbPaths.feedback
    }
  ]
}

function loadRecords(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch (error) {
    return []
  }
}

function saveRecords(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8')
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

function issueDownloadToken(recordId) {
  const token = crypto.randomBytes(24).toString('hex')
  downloadTokens.set(token, { recordId, expiresAt: Date.now() + DOWNLOAD_TOKEN_TTL_MS })
  return token
}

function consumeDownloadToken(token) {
  const payload = downloadTokens.get(token)
  if (!payload) return null
  downloadTokens.delete(token)
  if (payload.expiresAt < Date.now()) return null
  return payload
}

function buildBackupZipBuffer(record) {
  const targetDir = path.join(BACKUP_DIR, record.dirName || '')
  if (!fs.existsSync(targetDir)) {
    throw new Error('备份文件不存在')
  }
  const zip = new AdmZip()
  record.files.forEach((item) => {
    const filePath = path.join(targetDir, item.fileName)
    if (fs.existsSync(filePath)) {
      zip.addLocalFile(filePath)
    }
  })
  return zip.toBuffer()
}

function decodeHeader(value) {
  if (!value) return ''
  try {
    return decodeURIComponent(String(value))
  } catch (error) {
    return String(value)
  }
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

router.post('/auth/login', (req, res) => {
  const identifier = String(req.body.identifier || req.body.username || req.body.email || '').trim()
  const password = String(req.body.password || '')

  if (!identifier || !password) {
    return res.status(400).json({ error: '用户名或密码错误' })
  }

  const user = User.findRawByIdentifier(identifier)
  if (!user || !['dev', 'admin'].includes(user.role) || !User.verifyPassword(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' })
  }

  res.json({
    token: signAdminToken(user),
    expiresIn: ADMIN_JWT_EXPIRES_IN,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      user_type: user.user_type,
      grade: user.grade,
      role: user.role,
      isInitialAdmin: !!user.is_initial_admin,
      isInitialDev: !!user.is_initial_dev
    }
  })
})

router.get('/auth/me', requireAdmin, (req, res) => {
  res.json({ user: req.admin })
})

router.post('/auth/logout', requireAdmin, (req, res) => {
  res.json({ success: true })
})

router.get('/stats', requireAdmin, (req, res) => {
  res.json({
    users: User.counts(),
    vocabulary: Vocabulary.counts(),
    grammar: Grammar.counts(),
    text: Text.counts(),
    readingMaterials: ReadingMaterial.counts(),
    feedback: Feedback.statistics()
  })
})

router.get('/users', requireAdmin, (req, res) => {
  const requestedRole = String(req.query.role || 'all')
  const role = requestedRole === 'all' || ALLOWED_ROLES.includes(requestedRole) ? requestedRole : 'all'
  const result = User.list({
    limit: parseLimit(req.query.limit),
    offset: parseOffset(req.query.offset),
    role,
    keyword: req.query.keyword || '',
    excludeRoles: isDev(req) ? [] : ['dev']
  })
  res.json(result)
})

router.post('/users', requireAdmin, (req, res) => {
  const role = String(req.body.role || 'user')
  const rawUserType = String(req.body.user_type || 'student')
  const userType = normalizeUserType(rawUserType)
  const requestedGrade = String(req.body.grade || '').trim()
  const grade = normalizeGrade(userType, requestedGrade)

  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: '角色无效' })
  }
  if (!ALLOWED_USER_TYPES.includes(rawUserType)) {
    return res.status(400).json({ error: '用户类型无效' })
  }
  if (!isGradeAllowedForUserType(userType, grade)) {
    return res.status(400).json({ error: userType === 'teacher' ? '教师身份的年级必须为教师' : `学生年级仅支持：${STUDENT_GRADES.join('、')}` })
  }
  if (!isDev(req) && role === 'dev') {
    return forbid(res, 'admin 不可创建 dev 用户')
  }

  try {
    const id = User.create({
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
      role,
      user_type: userType,
      grade
    })
    res.status(201).json({ id })
  } catch (error) {
    return handleDbError(res, error, '创建用户失败')
  }
})

router.get('/users/:id', requireAdmin, (req, res) => {
  const user = User.findById(req.params.id)
  if (!user) return res.status(404).json({ error: '用户不存在' })
  if (!canAdminAccessTarget(req, user)) return forbid(res, 'admin 不能访问 dev 用户')
  res.json(user)
})

router.put('/users/:id', requireAdmin, (req, res) => {
  const target = User.findById(req.params.id)
  if (!target) return res.status(404).json({ error: '用户不存在' })
  if (!canAdminAccessTarget(req, target)) return forbid(res, 'admin 不能修改 dev 用户')

  const payload = {}
  if (req.body.username !== undefined) payload.username = req.body.username
  if (req.body.email !== undefined) payload.email = req.body.email
  if (req.body.password) payload.password = req.body.password

  if (req.body.user_type !== undefined) {
    const rawUserType = String(req.body.user_type)
    const userType = normalizeUserType(rawUserType)
    if (!ALLOWED_USER_TYPES.includes(rawUserType)) return res.status(400).json({ error: '用户类型无效' })
    payload.user_type = userType
  }

  if (req.body.grade !== undefined || payload.user_type !== undefined) {
    const nextUserType = payload.user_type !== undefined ? payload.user_type : target.user_type
    const nextGrade = normalizeGrade(nextUserType, req.body.grade !== undefined ? String(req.body.grade || '').trim() : target.grade)
    if (!isGradeAllowedForUserType(nextUserType, nextGrade)) {
      return res.status(400).json({ error: nextUserType === 'teacher' ? '教师身份的年级必须为教师' : `学生年级仅支持：${STUDENT_GRADES.join('、')}` })
    }
    payload.grade = nextGrade
  }

  if (req.body.role !== undefined) {
    const role = String(req.body.role)
    if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: '角色无效' })
    if (!isDev(req) && role === 'dev') return forbid(res, 'admin 不可提升 dev 用户')
    if (!isDev(req) && target.role === 'admin' && role !== 'admin' && Number(target.id) === Number(req.admin.id)) {
      return forbid(res, 'admin 不能降级自己')
    }
    payload.role = role
  }

  try {
    User.update(req.params.id, payload)
    res.json({ success: true })
  } catch (error) {
    return handleDbError(res, error, '更新用户失败')
  }
})

router.delete('/users/:id', requireAdmin, (req, res) => {
  const target = User.findById(req.params.id)
  if (!target) return res.status(404).json({ error: '用户不存在' })
  if (Number(target.id) === Number(req.admin.id)) return forbid(res, '不能删除当前登录用户')
  if (!canAdminAccessTarget(req, target)) return forbid(res, 'admin 不能删除 dev 用户')
  if (target.is_initial_dev) return forbid(res, '不可删除初始 dev 用户')

  User.delete(req.params.id)
  res.json({ success: true })
})

router.get('/vocabulary/options', requireAdmin, (req, res) => {
  res.json(Vocabulary.options())
})

router.get('/vocabulary', requireAdmin, (req, res) => {
  res.json(Vocabulary.list({
    limit: parseLimit(req.query.limit, 50, 500),
    offset: parseOffset(req.query.offset),
    keyword: req.query.q || req.query.keyword || '',
    userId: req.admin.id,
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

router.post('/vocabulary/:id/favorite', requireAdmin, (req, res) => {
  const item = Vocabulary.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '词条不存在' })
  Vocabulary.setFavorite(req.admin.id, req.params.id, true)
  res.json({ success: true, isFavorite: true })
})

router.delete('/vocabulary/:id/favorite', requireAdmin, (req, res) => {
  const item = Vocabulary.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '词条不存在' })
  Vocabulary.setFavorite(req.admin.id, req.params.id, false)
  res.json({ success: true, isFavorite: false })
})

router.post('/vocabulary/:id/key-word', requireAdmin, (req, res) => {
  const item = Vocabulary.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '词条不存在' })
  Vocabulary.setKeyWord(req.params.id, true)
  res.json({ success: true, isKeyWord: true })
})

router.delete('/vocabulary/:id/key-word', requireAdmin, (req, res) => {
  const item = Vocabulary.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '词条不存在' })
  Vocabulary.setKeyWord(req.params.id, false)
  res.json({ success: true, isKeyWord: false })
})

router.post('/vocabulary', requireAdmin, (req, res) => {
  const term = String(req.body.term || '').trim()
  if (!term) return res.status(400).json({ error: '词条不能为空' })

  const context = {
    textbook_id: Number(req.body.textbook_id),
    lesson_id: Number(req.body.lesson_id),
    unit_id: Number(req.body.unit_id)
  }

  if (!Vocabulary.contextExists(context)) {
    return res.status(400).json({ error: '教材、课或单元不存在' })
  }

  const id = Vocabulary.create({
    ...req.body,
    ...context,
    term
  })
  res.status(201).json({ id })
})

router.get('/vocabulary/:id', requireAdmin, (req, res) => {
  const item = Vocabulary.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '词条不存在' })
  res.json(item)
})

router.put('/vocabulary/:id', requireAdmin, (req, res) => {
  const existing = Vocabulary.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: '词条不存在' })

  const term = String(req.body.term || '').trim()
  if (!term) return res.status(400).json({ error: '词条不能为空' })

  Vocabulary.update(req.params.id, {
    term,
    supplement: req.body.supplement,
    accent: req.body.accent,
    part_of_speech: req.body.part_of_speech,
    explanation: req.body.explanation,
    is_proper_noun: req.body.is_proper_noun,
    is_onomatopoeia: req.body.is_onomatopoeia,
    is_loanword: req.body.is_loanword,
    has_kanji: req.body.has_kanji,
    is_key_word: req.body.is_key_word
  })
  res.json({ success: true })
})

router.delete('/vocabulary/:id', requireAdmin, (req, res) => {
  const existing = Vocabulary.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: '词条不存在' })
  Vocabulary.delete(req.params.id)
  res.json({ success: true })
})

router.get('/grammar/options', requireAdmin, (req, res) => {
  res.json(Grammar.options())
})

router.get('/grammar', requireAdmin, (req, res) => {
  res.json(Grammar.list({
    limit: parseLimit(req.query.limit, 50, 500),
    offset: parseOffset(req.query.offset),
    keyword: req.query.q || req.query.keyword || '',
    userId: req.admin.id,
    favoritesOnly: parseFlag(req.query.favoritesOnly || req.query.favorites_only),
    textbookId: req.query.textbookId,
    lessonId: req.query.lessonId,
    lessonNumberMin: req.query.lessonNumberMin || req.query.lesson_number_min,
    lessonNumberMax: req.query.lessonNumberMax || req.query.lesson_number_max,
    unitId: req.query.unitId,
    idOrder: req.query.id_order || req.query.idOrder || 'asc'
  }))
})

router.post('/grammar/:id/favorite', requireAdmin, (req, res) => {
  const item = Grammar.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '文法条目不存在' })
  Grammar.setFavorite(req.admin.id, req.params.id, true)
  res.json({ success: true, isFavorite: true })
})

router.delete('/grammar/:id/favorite', requireAdmin, (req, res) => {
  const item = Grammar.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '文法条目不存在' })
  Grammar.setFavorite(req.admin.id, req.params.id, false)
  res.json({ success: true, isFavorite: false })
})

router.post('/grammar', requireAdmin, (req, res) => {
  const grammar = String(req.body.grammar || '').trim()
  if (!grammar) return res.status(400).json({ error: '文法内容不能为空' })

  const context = {
    textbook_id: Number(req.body.textbook_id),
    lesson_id: Number(req.body.lesson_id),
    unit_id: Number(req.body.unit_id)
  }

  if (!Grammar.contextExists(context)) {
    return res.status(400).json({ error: '教材、课或单元不存在' })
  }

  const id = Grammar.create({
    ...req.body,
    ...context,
    grammar
  })
  res.status(201).json({ id })
})

router.get('/grammar/:id', requireAdmin, (req, res) => {
  const item = Grammar.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '文法条目不存在' })
  res.json(item)
})

router.put('/grammar/:id', requireAdmin, (req, res) => {
  const existing = Grammar.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: '文法条目不存在' })

  const grammar = String(req.body.grammar || '').trim()
  if (!grammar) return res.status(400).json({ error: '文法内容不能为空' })

  Grammar.update(req.params.id, {
    grammar,
    brief_logic: req.body.brief_logic,
    meaning: req.body.meaning,
    translation: req.body.translation,
    formation: req.body.formation,
    notes: req.body.notes,
    examples: req.body.examples
  })
  res.json({ success: true })
})

router.delete('/grammar/:id', requireAdmin, (req, res) => {
  const existing = Grammar.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: '文法条目不存在' })
  Grammar.delete(req.params.id)
  res.json({ success: true })
})

router.get('/texts/options', requireAdmin, (req, res) => {
  res.json(Text.options())
})

router.get('/texts', requireAdmin, (req, res) => {
  res.json(Text.list({
    limit: parseLimit(req.query.limit, 50, 500),
    offset: parseOffset(req.query.offset),
    textbookId: req.query.textbookId,
    idOrder: req.query.id_order || req.query.idOrder || 'asc'
  }))
})

router.post('/texts', requireAdmin, (req, res) => {
  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ error: '课文名称不能为空' })

  const textbookId = Number(req.body.textbook_id)
  if (!Text.textbookExists(textbookId)) {
    return res.status(400).json({ error: '教材不存在' })
  }

  const id = Text.create({
    ...req.body,
    textbook_id: textbookId,
    title
  })
  res.status(201).json({ id })
})

router.get('/texts/:id', requireAdmin, (req, res) => {
  const item = Text.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '课文条目不存在' })
  res.json(item)
})

router.put('/texts/:id', requireAdmin, (req, res) => {
  const existing = Text.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: '课文条目不存在' })

  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ error: '课文名称不能为空' })

  Text.update(req.params.id, {
    lesson_number: req.body.lesson_number,
    unit_number: req.body.unit_number,
    title,
    content: req.body.content
  })
  res.json({ success: true })
})

router.delete('/texts/:id', requireAdmin, (req, res) => {
  const existing = Text.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: '课文条目不存在' })
  Text.delete(req.params.id)
  res.json({ success: true })
})

router.get('/reading-materials', requireAdmin, (req, res) => {
  const result = ReadingMaterial.list({
    limit: parseLimit(req.query.limit, 50, 500),
    offset: parseOffset(req.query.offset),
    keyword: req.query.keyword || '',
    idOrder: req.query.id_order || req.query.idOrder || 'desc'
  })
  const baseUrl = `${req.protocol}://${req.get('host')}`
  res.json({
    rows: result.rows.map((row) => ({
      ...row,
      view_url: row.can_view ? `${baseUrl}/admin/reading-materials/open?token=${ReadingMaterial.issueAccessToken(row.id)}` : null
    })),
    total: result.total
  })
})

router.post(
  '/reading-materials/upload',
  requireAdmin,
  express.raw({ type: '*/*', limit: '200mb' }),
  (req, res) => {
    try {
      const originalFilename = decodeHeader(req.get('x-file-name'))
      const title = decodeHeader(req.get('x-title'))
      const id = ReadingMaterial.create({
        title,
        originalFilename,
        buffer: req.body,
        createdBy: req.admin?.id
      })
      res.status(201).json({ id })
    } catch (error) {
      return res.status(400).json({ error: error.message || '上传失败' })
    }
  }
)

router.get('/reading-materials/open', (req, res) => {
  const payload = ReadingMaterial.resolveAccessToken(req.query.token)
  if (!payload) return res.status(401).json({ error: '查看链接已失效' })

  const item = ReadingMaterial.findById(payload.id)
  if (!item) return res.status(404).json({ error: '阅读材料不存在' })
  return streamReadingMaterial(res, item, { view: true })
})

router.get('/reading-materials/:id/open-link', requireAdmin, (req, res) => {
  const item = ReadingMaterial.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '阅读材料不存在' })
  if (!ReadingMaterial.canView(item)) return res.status(400).json({ error: '该文件暂不可在线查看，请下载后打开' })

  const token = ReadingMaterial.issueAccessToken(item.id)
  const baseUrl = `${req.protocol}://${req.get('host')}`
  res.json({ url: `${baseUrl}/admin/reading-materials/open?token=${token}` })
})

router.get('/reading-materials/:id', requireAdmin, (req, res) => {
  const item = ReadingMaterial.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '阅读材料不存在' })
  const { file_path, ...publicItem } = item
  res.json(publicItem)
})

router.get('/reading-materials/:id/content', requireAdmin, (req, res) => {
  const item = ReadingMaterial.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '阅读材料不存在' })
  return streamReadingMaterial(res, item)
})

router.put('/reading-materials/:id', requireAdmin, (req, res) => {
  const existing = ReadingMaterial.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: '阅读材料不存在' })

  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ error: '标题不能为空' })

  ReadingMaterial.update(req.params.id, { title })
  res.json({ success: true })
})

router.delete('/reading-materials/:id', requireAdmin, (req, res) => {
  const existing = ReadingMaterial.findById(req.params.id)
  if (!existing) return res.status(404).json({ error: '阅读材料不存在' })
  ReadingMaterial.delete(req.params.id)
  res.json({ success: true })
})

router.get('/feedback', requireAdmin, (req, res) => {
  const result = Feedback.list({
    limit: parseLimit(req.query.limit),
    offset: parseOffset(req.query.offset),
    keyword: req.query.keyword || '',
    feedbackType: req.query.feedbackType || req.query.feedback_type || 'all'
  })
  res.json({ feedbackList: result.rows, total: result.total, feedbackTypes: FEEDBACK_TYPES })
})

router.get('/feedback/:id', requireAdmin, (req, res) => {
  const item = Feedback.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '反馈不存在' })
  res.json(item)
})

router.delete('/feedback/:id', requireAdmin, (req, res) => {
  const item = Feedback.findById(req.params.id)
  if (!item) return res.status(404).json({ error: '反馈不存在' })
  Feedback.delete(req.params.id)
  res.json({ success: true })
})

router.get('/db-files', requireAdmin, (req, res) => {
  if (!isDev(req)) return forbid(res, '仅 dev 可查看可备份文件')
  res.json({
    files: getAllowedFiles().map(({ key, label, fileName }) => ({ key, label, fileName }))
  })
})

router.get('/db-backups', requireAdmin, (req, res) => {
  if (!isDev(req)) return forbid(res, '仅 dev 可查看备份记录')
  res.json({ records: loadRecords(BACKUP_RECORDS_FILE) })
})

router.post('/db-backups', requireAdmin, (req, res) => {
  if (!isDev(req)) return forbid(res, '仅 dev 可新增备份')

  const requestedKeys = Array.isArray(req.body?.files) ? req.body.files : []
  const allowedFiles = getAllowedFiles()
  const allowedMap = new Map(allowedFiles.map((item) => [item.key, item]))
  const selected = requestedKeys.length
    ? requestedKeys.map((key) => allowedMap.get(key)).filter(Boolean)
    : allowedFiles

  if (!selected.length) return res.status(400).json({ error: '请选择需要备份的文件' })

  const missing = selected.filter((item) => !fs.existsSync(item.path))
  if (missing.length) {
    return res.status(400).json({ error: `文件不存在：${missing.map((item) => item.fileName).join(', ')}` })
  }

  const timestamp = formatTimestamp()
  const id = String(Date.now())
  const dirName = `${timestamp.replace(/[^0-9]/g, '')}_${id}`
  const targetDir = path.join(BACKUP_DIR, dirName)
  fs.mkdirSync(targetDir, { recursive: true })

  selected.forEach((item) => fs.copyFileSync(item.path, path.join(targetDir, item.fileName)))

  const record = {
    id,
    createdAt: timestamp,
    files: selected.map(({ key, label, fileName }) => ({ key, label, fileName })),
    dirName
  }
  const records = loadRecords(BACKUP_RECORDS_FILE)
  records.unshift(record)
  saveRecords(BACKUP_RECORDS_FILE, records)

  res.status(201).json({ success: true, record })
})

router.delete('/db-backups/:id', requireAdmin, (req, res) => {
  if (!isDev(req)) return forbid(res, '仅 dev 可删除备份记录')

  const records = loadRecords(BACKUP_RECORDS_FILE)
  const index = records.findIndex((item) => item.id === req.params.id)
  if (index === -1) return res.status(404).json({ error: '备份记录不存在' })

  const [record] = records.splice(index, 1)
  saveRecords(BACKUP_RECORDS_FILE, records)
  if (record?.dirName) {
    fs.rmSync(path.join(BACKUP_DIR, record.dirName), { recursive: true, force: true })
  }
  res.json({ success: true })
})

router.get('/db-backups/:id/download-link', requireAdmin, (req, res) => {
  if (!isDev(req)) return forbid(res, '仅 dev 可下载备份')
  const record = loadRecords(BACKUP_RECORDS_FILE).find((item) => item.id === req.params.id)
  if (!record) return res.status(404).json({ error: '备份记录不存在' })

  const token = issueDownloadToken(record.id)
  const baseUrl = `${req.protocol}://${req.get('host')}`
  res.json({ url: `${baseUrl}/admin/db-backups/download?token=${token}`, token })
})

router.get('/db-backups/download', (req, res) => {
  const payload = consumeDownloadToken(String(req.query.token || ''))
  if (!payload) return res.status(401).json({ error: '下载链接已失效' })

  const record = loadRecords(BACKUP_RECORDS_FILE).find((item) => item.id === payload.recordId)
  if (!record) return res.status(404).json({ error: '备份记录不存在' })

  try {
    const buffer = buildBackupZipBuffer(record)
    const fileName = `backup_${record.createdAt.replace(/[:\s]/g, '')}.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)
  } catch (error) {
    res.status(404).json({ error: error.message || '备份文件不存在' })
  }
})

router.post('/db-backups/:id/restore', requireAdmin, (req, res) => {
  if (!isDev(req)) return forbid(res, '仅 dev 可还原备份')

  const record = loadRecords(BACKUP_RECORDS_FILE).find((item) => item.id === req.params.id)
  if (!record) return res.status(404).json({ error: '备份记录不存在' })

  const targetDir = path.join(BACKUP_DIR, record.dirName || '')
  if (!fs.existsSync(targetDir)) return res.status(404).json({ error: '备份文件不存在' })

  const allowedMap = new Map(getAllowedFiles().map((item) => [item.fileName, item]))
  record.files.forEach((item) => {
    const definition = allowedMap.get(item.fileName)
    if (!definition) return
    const sourcePath = path.join(targetDir, item.fileName)
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, definition.path)
    }
  })
  res.json({ success: true })
})

router.get('/db-imports', requireAdmin, (req, res) => {
  if (!isDev(req)) return forbid(res, '仅 dev 可查看导入记录')
  res.json({ records: loadRecords(IMPORT_RECORDS_FILE) })
})

router.delete('/db-imports/:id', requireAdmin, (req, res) => {
  if (!isDev(req)) return forbid(res, '仅 dev 可删除导入记录')
  const records = loadRecords(IMPORT_RECORDS_FILE)
  const index = records.findIndex((item) => item.id === req.params.id)
  if (index === -1) return res.status(404).json({ error: '导入记录不存在' })
  records.splice(index, 1)
  saveRecords(IMPORT_RECORDS_FILE, records)
  res.json({ success: true })
})

router.post(
  '/db-imports',
  requireAdmin,
  (req, res, next) => {
    if (!isDev(req)) return forbid(res, '仅 dev 可导入备份')
    next()
  },
  express.raw({ type: 'application/zip', limit: '300mb' }),
  (req, res) => {
    try {
      if (!req.body || !req.body.length) {
        return res.status(400).json({ error: '上传内容为空' })
      }

      const allowedFiles = getAllowedFiles()
      const allowedByName = new Map(allowedFiles.map((item) => [item.fileName, item]))
      const zip = new AdmZip(req.body)
      const entries = zip.getEntries().filter((entry) => !entry.isDirectory)
      if (!entries.length) return res.status(400).json({ error: '压缩包中没有可导入文件' })

      const invalidEntry = entries.find((entry) => !allowedByName.has(path.basename(entry.entryName)))
      if (invalidEntry) {
        return res.status(400).json({ error: `不支持的文件：${invalidEntry.entryName}` })
      }

      const importedFiles = []
      entries.forEach((entry) => {
        const fileName = path.basename(entry.entryName)
        const definition = allowedByName.get(fileName)
        if (!definition) return
        fs.writeFileSync(definition.path, entry.getData())
        importedFiles.push(fileName)
      })

      const record = {
        id: String(Date.now()),
        createdAt: formatTimestamp(),
        files: importedFiles
      }
      const records = loadRecords(IMPORT_RECORDS_FILE)
      records.unshift(record)
      saveRecords(IMPORT_RECORDS_FILE, records)

      res.status(201).json({ success: true, record })
    } catch (error) {
      console.error('导入失败:', error)
      res.status(500).json({ error: '导入失败' })
    }
  }
)

module.exports = router
