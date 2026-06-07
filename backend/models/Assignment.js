const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { dataDir, readingMaterialsDb, userDb } = require('../database/db')
const { User } = require('./User')

const STORAGE_DIR_NAME = 'assignment_files'
const STORAGE_DIR = path.join(dataDir, STORAGE_DIR_NAME)
const MAX_HTML_SIZE = 10 * 1024 * 1024
const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const MAX_PDF_SIZE = 200 * 1024 * 1024
const MAX_DOCUMENT_SIZE = 200 * 1024 * 1024

const TYPE_BY_EXTENSION = {
  '.html': { category: 'html', mimeType: 'text/html; charset=utf-8', maxSize: MAX_HTML_SIZE, label: 'HTML' },
  '.htm': { category: 'html', mimeType: 'text/html; charset=utf-8', maxSize: MAX_HTML_SIZE, label: 'HTML' },
  '.pdf': { category: 'pdf', mimeType: 'application/pdf', maxSize: MAX_PDF_SIZE, label: 'PDF' },
  '.doc': { category: 'document', mimeType: 'application/msword', maxSize: MAX_DOCUMENT_SIZE, label: 'DOC' },
  '.docx': {
    category: 'document',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    maxSize: MAX_DOCUMENT_SIZE,
    label: 'DOCX'
  },
  '.jpg': { category: 'image', mimeType: 'image/jpeg', maxSize: MAX_IMAGE_SIZE, label: 'JPG' },
  '.jpeg': { category: 'image', mimeType: 'image/jpeg', maxSize: MAX_IMAGE_SIZE, label: 'JPEG' },
  '.png': { category: 'image', mimeType: 'image/png', maxSize: MAX_IMAGE_SIZE, label: 'PNG' },
  '.gif': { category: 'image', mimeType: 'image/gif', maxSize: MAX_IMAGE_SIZE, label: 'GIF' },
  '.webp': { category: 'image', mimeType: 'image/webp', maxSize: MAX_IMAGE_SIZE, label: 'WEBP' },
  '.bmp': { category: 'image', mimeType: 'image/bmp', maxSize: MAX_IMAGE_SIZE, label: 'BMP' },
  '.svg': { category: 'image', mimeType: 'image/svg+xml', maxSize: MAX_IMAGE_SIZE, label: 'SVG' },
  '.avif': { category: 'image', mimeType: 'image/avif', maxSize: MAX_IMAGE_SIZE, label: 'AVIF' },
  '.ico': { category: 'image', mimeType: 'image/x-icon', maxSize: MAX_IMAGE_SIZE, label: 'ICO' },
  '.tif': { category: 'image', mimeType: 'image/tiff', maxSize: MAX_IMAGE_SIZE, label: 'TIFF' },
  '.tiff': { category: 'image', mimeType: 'image/tiff', maxSize: MAX_IMAGE_SIZE, label: 'TIFF' },
  '.heic': { category: 'image', mimeType: 'image/heic', maxSize: MAX_IMAGE_SIZE, label: 'HEIC' },
  '.heif': { category: 'image', mimeType: 'image/heif', maxSize: MAX_IMAGE_SIZE, label: 'HEIF' }
}

fs.mkdirSync(STORAGE_DIR, { recursive: true })

function normalizeText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

function normalizeFlag(value) {
  return value ? 1 : 0
}

function sanitizeFilename(value) {
  const basename = path.basename(String(value || '').trim())
  return basename.replace(/[^\w.\-\u3040-\u30ff\u3400-\u9fff]/g, '_') || 'assignment-file'
}

function fileDefinitionFor(filename) {
  const clean = sanitizeFilename(filename)
  const ext = path.extname(clean).toLowerCase()
  const definition = TYPE_BY_EXTENSION[ext]
  if (!definition) throw new Error('仅支持 HTML、图片、PDF 或 Word 文件')
  return { ...definition, extension: ext, filename: clean }
}

function storedFilenameFor(originalFilename) {
  const ext = path.extname(originalFilename).toLowerCase()
  return `${Date.now()}_${crypto.randomBytes(12).toString('hex')}${ext}`
}

function validateOptionalUpload(file = {}) {
  const originalFilename = normalizeText(file.originalFilename)
  const buffer = file.buffer
  if (!originalFilename && (!Buffer.isBuffer(buffer) || buffer.length === 0)) return null
  if (!originalFilename) throw new Error('上传文件名不能为空')
  const definition = fileDefinitionFor(originalFilename)
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('上传文件不能为空')
  if (buffer.length > definition.maxSize) {
    if (definition.category === 'document') throw new Error('Word 文件不能超过 200MB')
    if (definition.category === 'pdf') throw new Error('PDF 文件不能超过 200MB')
    if (definition.category === 'image') throw new Error('图片文件不能超过 20MB')
    throw new Error('HTML 文件不能超过 10MB')
  }
  return definition
}

function fileFormat(filename) {
  const definition = TYPE_BY_EXTENSION[path.extname(String(filename || '')).toLowerCase()]
  if (definition) return definition.label
  return path.extname(String(filename || '')).replace('.', '').toUpperCase() || '文件'
}

function contentType(row) {
  return row?.mime_type || TYPE_BY_EXTENSION[path.extname(String(row?.original_filename || '')).toLowerCase()]?.mimeType || 'application/octet-stream'
}

function absolutePath(row) {
  if (!row?.file_path) return null
  return path.join(dataDir, row.file_path)
}

function publicFile(row) {
  if (!row) return null
  return {
    id: row.id,
    original_filename: row.original_filename,
    file_size: Number(row.file_size || 0),
    file_format: fileFormat(row.original_filename),
    file_category: row.file_category || 'file',
    created_at: row.created_at
  }
}

function attachUser(row, fieldName, outputName) {
  const user = row?.[fieldName] ? User.findById(row[fieldName]) : null
  return {
    ...row,
    [outputName]: user?.username || null
  }
}

function removeStoredFile(row) {
  const target = absolutePath(row)
  if (target && target.startsWith(STORAGE_DIR) && fs.existsSync(target)) {
    fs.rmSync(target, { force: true })
  }
}

function createStoredFile({ table, ownerColumn, ownerId, originalFilename, buffer, createdBy, fileRole = null }) {
  const definition = validateOptionalUpload({ originalFilename, buffer })
  if (!definition) return null

  const original = definition.filename
  const stored = storedFilenameFor(original)
  const relativePath = path.join(STORAGE_DIR_NAME, stored)
  const absoluteTarget = path.join(STORAGE_DIR, stored)
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')
  fs.writeFileSync(absoluteTarget, buffer)

  const columns = [ownerColumn]
  const values = [Number(ownerId)]
  if (fileRole !== null) {
    columns.push('file_role')
    values.push(fileRole)
  }
  columns.push(
    'original_filename',
    'stored_filename',
    'file_path',
    'mime_type',
    'file_category',
    'file_size',
    'content_hash',
    'created_by',
    'created_at'
  )
  values.push(
    original,
    stored,
    relativePath,
    definition.mimeType,
    definition.category,
    buffer.length,
    hash,
    createdBy || null
  )

  const placeholders = columns.map((column) => column === 'created_at' ? "datetime('now', 'localtime')" : '?').join(', ')
  const bindValues = values.filter((_, index) => columns[index] !== 'created_at')
  const result = readingMaterialsDb.prepare(`
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders})
  `).run(...bindValues)
  return result.lastInsertRowid
}

function filesForAssignment(assignmentId) {
  return readingMaterialsDb.prepare(`
    SELECT id, original_filename, file_size, file_category, created_at
    FROM assignment_files
    WHERE assignment_id = ?
    ORDER BY id ASC
  `).all(Number(assignmentId)).map(publicFile)
}

function filesForSubmission(submissionId) {
  return readingMaterialsDb.prepare(`
    SELECT id, original_filename, file_size, file_category, created_at
    FROM assignment_submission_files
    WHERE submission_id = ?
    ORDER BY id ASC
  `).all(Number(submissionId)).map(publicFile)
}

function filesForFeedback(feedbackId) {
  return readingMaterialsDb.prepare(`
    SELECT id, original_filename, file_size, file_category, created_at
    FROM assignment_feedback_files
    WHERE feedback_id = ?
    ORDER BY id ASC
  `).all(Number(feedbackId)).map(publicFile)
}

function publicAssignment(row) {
  if (!row) return null
  const withUser = attachUser(row, 'created_by', 'creator_username')
  return {
    ...withUser,
    is_public: !!withUser.is_public,
    submission_student_count: Number(withUser.submission_student_count || 0),
    files: filesForAssignment(withUser.id)
  }
}

function publicSubmission(row, { viewerUserId, canManage = false } = {}) {
  if (!row) return null
  const withStudent = attachUser(row, 'user_id', 'student_username')
  const canSeeFeedback = canManage || Number(row.user_id) === Number(viewerUserId)
  return {
    ...withStudent,
    files: filesForSubmission(row.id),
    feedback: canSeeFeedback ? Assignment.feedbackForStudent(row.assignment_id, row.user_id) : null
  }
}

class Assignment {
  static list({ classId, userId, limit = 50, offset = 0, keyword = '', idOrder = 'desc', submissionOrder = '' } = {}) {
    const clauses = ['class_id = ?']
    const params = [Number(classId)]
    const normalizedKeyword = String(keyword || '').trim().toLowerCase()
    if (normalizedKeyword) {
      clauses.push('(lower(title) LIKE ? OR lower(COALESCE(content, "")) LIKE ?)')
      params.push(`%${normalizedKeyword}%`, `%${normalizedKeyword}%`)
    }
    const where = `WHERE ${clauses.join(' AND ')}`
    const order = String(idOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'
    const submissionSort = String(submissionOrder || '').toLowerCase()
    const orderBy = submissionSort === 'asc' || submissionSort === 'desc'
      ? `submission_student_count ${submissionSort.toUpperCase()}, a.id ${order}`
      : `a.id ${order}`
    const rows = readingMaterialsDb.prepare(`
      SELECT
        a.*,
        (
          SELECT COUNT(DISTINCT s.user_id)
          FROM assignment_submissions s
          WHERE s.assignment_id = a.id
        ) AS submission_student_count,
        (
          SELECT MAX(datetime(s.created_at))
          FROM assignment_submissions s
          WHERE s.assignment_id = a.id AND s.user_id = ?
        ) AS my_latest_submission_at
      FROM assignments a
      ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(Number(userId), ...params, Number(limit || 50), Number(offset || 0)).map(publicAssignment)

    const total = readingMaterialsDb.prepare(`
      SELECT COUNT(*) AS total
      FROM assignments
      ${where}
    `).get(...params).total

    return { rows, total }
  }

  static findById(id) {
    const row = readingMaterialsDb.prepare(`
      SELECT
        a.*,
        (
          SELECT COUNT(DISTINCT s.user_id)
          FROM assignment_submissions s
          WHERE s.assignment_id = a.id
        ) AS submission_student_count
      FROM assignments a
      WHERE a.id = ?
    `).get(Number(id))
    return publicAssignment(row)
  }

  static create({ classId, title, content, isPublic = false, createdBy, file = null }) {
    const normalizedTitle = normalizeText(title)
    if (!normalizedTitle) throw new Error('作业名不能为空')

    const result = readingMaterialsDb.prepare(`
      INSERT INTO assignments (class_id, title, content, is_public, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(Number(classId), normalizedTitle, normalizeText(content), normalizeFlag(isPublic), createdBy || null)

    createStoredFile({
      table: 'assignment_files',
      ownerColumn: 'assignment_id',
      ownerId: result.lastInsertRowid,
      originalFilename: file?.originalFilename,
      buffer: file?.buffer,
      createdBy,
      fileRole: 'assignment'
    })

    return result.lastInsertRowid
  }

  static update(id, { title, content, isPublic = false, file = null }) {
    const normalizedTitle = normalizeText(title)
    if (!normalizedTitle) throw new Error('作业名不能为空')

    const result = readingMaterialsDb.prepare(`
      UPDATE assignments
      SET title = ?, content = ?, is_public = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(normalizedTitle, normalizeText(content), normalizeFlag(isPublic), Number(id))

    if (file?.originalFilename || (Buffer.isBuffer(file?.buffer) && file.buffer.length > 0)) {
      this.deleteAssignmentFiles(id)
      createStoredFile({
        table: 'assignment_files',
        ownerColumn: 'assignment_id',
        ownerId: id,
        originalFilename: file.originalFilename,
        buffer: file.buffer,
        createdBy: file.createdBy,
        fileRole: 'assignment'
      })
    }

    return result
  }

  static delete(id) {
    const assignment = this.findById(id)
    if (!assignment) return { changes: 0 }
    this.deleteAssignmentFiles(id)
    const submissions = readingMaterialsDb.prepare('SELECT id FROM assignment_submissions WHERE assignment_id = ?').all(Number(id))
    submissions.forEach((submission) => this.deleteSubmissionFiles(submission.id))
    const feedbackRows = readingMaterialsDb.prepare('SELECT id FROM assignment_feedback WHERE assignment_id = ?').all(Number(id))
    feedbackRows.forEach((feedback) => this.deleteFeedbackFiles(feedback.id))
    return readingMaterialsDb.prepare('DELETE FROM assignments WHERE id = ?').run(Number(id))
  }

  static deleteAssignmentFiles(assignmentId) {
    const rows = readingMaterialsDb.prepare('SELECT * FROM assignment_files WHERE assignment_id = ?').all(Number(assignmentId))
    rows.forEach(removeStoredFile)
    readingMaterialsDb.prepare('DELETE FROM assignment_files WHERE assignment_id = ?').run(Number(assignmentId))
  }

  static latestSubmissionForUser(assignmentId, userId) {
    return readingMaterialsDb.prepare(`
      SELECT *
      FROM assignment_submissions
      WHERE assignment_id = ? AND user_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 1
    `).get(Number(assignmentId), Number(userId))
  }

  static createSubmission({ assignmentId, userId, textContent, file = null }) {
    const normalizedText = normalizeText(textContent)
    const hasFile = !!(file?.originalFilename || (Buffer.isBuffer(file?.buffer) && file.buffer.length > 0))
    if (!normalizedText && !hasFile) throw new Error('请填写提交内容或上传文件')

    const result = readingMaterialsDb.prepare(`
      INSERT INTO assignment_submissions (assignment_id, user_id, text_content, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(Number(assignmentId), Number(userId), normalizedText)

    createStoredFile({
      table: 'assignment_submission_files',
      ownerColumn: 'submission_id',
      ownerId: result.lastInsertRowid,
      originalFilename: file?.originalFilename,
      buffer: file?.buffer,
      createdBy: userId
    })

    return result.lastInsertRowid
  }

  static deleteSubmissionFiles(submissionId) {
    const rows = readingMaterialsDb.prepare('SELECT * FROM assignment_submission_files WHERE submission_id = ?').all(Number(submissionId))
    rows.forEach(removeStoredFile)
    readingMaterialsDb.prepare('DELETE FROM assignment_submission_files WHERE submission_id = ?').run(Number(submissionId))
  }

  static feedbackForStudent(assignmentId, studentUserId) {
    const row = readingMaterialsDb.prepare(`
      SELECT *
      FROM assignment_feedback
      WHERE assignment_id = ? AND student_user_id = ?
    `).get(Number(assignmentId), Number(studentUserId))
    if (!row) return null
    const withTeacher = attachUser(row, 'teacher_user_id', 'teacher_username')
    return {
      ...withTeacher,
      files: filesForFeedback(row.id)
    }
  }

  static upsertFeedback({ assignmentId, submissionId, studentUserId, teacherUserId, textContent, file = null }) {
    const existing = this.feedbackForStudent(assignmentId, studentUserId)
    const normalizedText = normalizeText(textContent)
    const hasNewFile = !!(file?.originalFilename || (Buffer.isBuffer(file?.buffer) && file.buffer.length > 0))
    const hasExistingFile = !!existing?.files?.length
    if (!normalizedText && !hasNewFile && !hasExistingFile) throw new Error('请填写反馈内容或上传文件')

    let feedbackId = existing?.id
    if (feedbackId) {
      readingMaterialsDb.prepare(`
        UPDATE assignment_feedback
        SET submission_id = ?, teacher_user_id = ?, text_content = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(Number(submissionId), Number(teacherUserId), normalizedText, Number(feedbackId))
      if (hasNewFile) this.deleteFeedbackFiles(feedbackId)
    } else {
      const result = readingMaterialsDb.prepare(`
        INSERT INTO assignment_feedback (
          assignment_id,
          student_user_id,
          submission_id,
          teacher_user_id,
          text_content,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
      `).run(Number(assignmentId), Number(studentUserId), Number(submissionId), Number(teacherUserId), normalizedText)
      feedbackId = result.lastInsertRowid
    }

    if (hasNewFile) {
      createStoredFile({
        table: 'assignment_feedback_files',
        ownerColumn: 'feedback_id',
        ownerId: feedbackId,
        originalFilename: file.originalFilename,
        buffer: file.buffer,
        createdBy: teacherUserId
      })
    }

    return feedbackId
  }

  static deleteFeedbackFiles(feedbackId) {
    const rows = readingMaterialsDb.prepare('SELECT * FROM assignment_feedback_files WHERE feedback_id = ?').all(Number(feedbackId))
    rows.forEach(removeStoredFile)
    readingMaterialsDb.prepare('DELETE FROM assignment_feedback_files WHERE feedback_id = ?').run(Number(feedbackId))
  }

  static listSubmissions({ assignmentId, viewerUserId, canManage = false, includePublic = false }) {
    const clauses = ['assignment_id = ?']
    const params = [Number(assignmentId)]
    if (!canManage && !includePublic) {
      clauses.push('user_id = ?')
      params.push(Number(viewerUserId))
    }
    const rows = readingMaterialsDb.prepare(`
      SELECT *
      FROM assignment_submissions
      WHERE ${clauses.join(' AND ')}
      ORDER BY datetime(created_at) DESC, id DESC
    `).all(...params)

    return rows.map((row) => publicSubmission(row, { viewerUserId, canManage }))
  }

  static listStudentSubmissionSummaries({ classId, assignmentId, viewerUserId }) {
    const students = userDb.prepare(`
      SELECT
        cm.user_id,
        cm.created_at AS joined_at,
        u.username,
        u.email
      FROM class_memberships cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.class_id = ? AND u.user_type = 'student'
      ORDER BY datetime(cm.created_at) ASC, cm.id ASC
    `).all(Number(classId))

    const submissions = readingMaterialsDb.prepare(`
      SELECT *
      FROM assignment_submissions
      WHERE assignment_id = ?
      ORDER BY datetime(created_at) ASC, id ASC
    `).all(Number(assignmentId))

    const submissionsByUser = new Map()
    submissions.forEach((row) => {
      const key = Number(row.user_id)
      if (!submissionsByUser.has(key)) submissionsByUser.set(key, [])
      submissionsByUser.get(key).push(row)
    })

    return students.map((student) => {
      const studentSubmissions = submissionsByUser.get(Number(student.user_id)) || []
      const numberedSubmissions = studentSubmissions
        .map((submission, index) => ({
          ...publicSubmission(submission, { viewerUserId, canManage: true }),
          attempt_number: index + 1
        }))
        .sort((left, right) => {
          const timeCompare = String(right.created_at || '').localeCompare(String(left.created_at || ''))
          return timeCompare || Number(right.id) - Number(left.id)
        })

      return {
        user_id: student.user_id,
        username: student.username,
        email: student.email,
        submitted: numberedSubmissions.length > 0,
        submission_count: numberedSubmissions.length,
        first_submission_at: studentSubmissions[0]?.created_at || null,
        latest_submission_at: studentSubmissions[studentSubmissions.length - 1]?.created_at || null,
        feedback: this.feedbackForStudent(assignmentId, student.user_id),
        submissions: numberedSubmissions
      }
    })
  }

  static findSubmission(id) {
    const row = readingMaterialsDb.prepare('SELECT * FROM assignment_submissions WHERE id = ?').get(Number(id))
    if (!row) return null
    return publicSubmission(row, { viewerUserId: row.user_id, canManage: true })
  }

  static findAssignmentFile(id) {
    return readingMaterialsDb.prepare('SELECT * FROM assignment_files WHERE id = ?').get(Number(id))
  }

  static findSubmissionFile(id) {
    return readingMaterialsDb.prepare(`
      SELECT f.*, s.assignment_id, s.user_id
      FROM assignment_submission_files f
      JOIN assignment_submissions s ON s.id = f.submission_id
      WHERE f.id = ?
    `).get(Number(id))
  }

  static findFeedbackFile(id) {
    return readingMaterialsDb.prepare(`
      SELECT f.*, fb.assignment_id, fb.student_user_id
      FROM assignment_feedback_files f
      JOIN assignment_feedback fb ON fb.id = f.feedback_id
      WHERE f.id = ?
    `).get(Number(id))
  }

  static fileAbsolutePath(row) {
    return absolutePath(row)
  }

  static contentType(row) {
    return contentType(row)
  }

  static downloadFilename(row) {
    return sanitizeFilename(row?.original_filename || 'assignment-file')
  }
}

module.exports = {
  Assignment
}
