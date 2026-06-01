const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const { dataDir, readingMaterialsDb } = require('../database/db')
const { User } = require('./User')

const STORAGE_DIR_NAME = 'reading_materials'
const STORAGE_DIR = path.join(dataDir, STORAGE_DIR_NAME)
const MAX_HTML_SIZE = 10 * 1024 * 1024
const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const MAX_PDF_SIZE = 200 * 1024 * 1024
const MAX_DOCUMENT_SIZE = 200 * 1024 * 1024
const MAX_READING_MATERIAL_SIZE = MAX_PDF_SIZE
const CONTENT_TOKEN_TTL_MS = 60 * 60 * 1000
const contentTokens = new Map()

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

function sanitizeFilename(value) {
  const basename = path.basename(String(value || '').trim())
  return basename.replace(/[^\w.\-\u3040-\u30ff\u3400-\u9fff]/g, '_') || 'material.html'
}

function fileDefinitionFor(filename) {
  const clean = sanitizeFilename(filename)
  const ext = path.extname(clean).toLowerCase()
  const definition = TYPE_BY_EXTENSION[ext]
  if (!definition) {
    throw new Error('仅支持 HTML、图片、PDF 或 Word 文件')
  }
  return { ...definition, extension: ext, filename: clean }
}

function storedFilenameFor(originalFilename) {
  const ext = path.extname(originalFilename).toLowerCase()
  return `${Date.now()}_${crypto.randomBytes(12).toString('hex')}${ext}`
}

function previewFilenameFor(storedFilename) {
  return `${path.basename(storedFilename, path.extname(storedFilename))}.pdf`
}

function findOfficeBinary() {
  const candidates = [
    process.env.LIBREOFFICE_PATH,
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    'soffice',
    'libreoffice'
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && fs.existsSync(candidate)) return candidate
    if (!candidate.includes(path.sep)) {
      const result = spawnSync('which', [candidate], { encoding: 'utf8' })
      if (result.status === 0 && result.stdout.trim()) return result.stdout.trim()
    }
  }
  return null
}

function convertDocumentToPdf(absolutePath, storedFilename) {
  const binary = findOfficeBinary()
  if (!binary) {
    return {
      previewFilePath: null,
      conversionStatus: 'unavailable',
      conversionError: '未安装 LibreOffice，无法生成 PDF 预览'
    }
  }

  const previewFilename = previewFilenameFor(storedFilename)
  const previewAbsolutePath = path.join(STORAGE_DIR, previewFilename)
  const previewRelativePath = path.join(STORAGE_DIR_NAME, previewFilename)
  const result = spawnSync(binary, [
    '--headless',
    '--convert-to',
    'pdf',
    '--outdir',
    STORAGE_DIR,
    absolutePath
  ], {
    encoding: 'utf8',
    timeout: 120000
  })

  if (result.error) {
    return {
      previewFilePath: null,
      conversionStatus: 'failed',
      conversionError: result.error.message || 'Word 转 PDF 失败'
    }
  }

  if (result.status !== 0 || !fs.existsSync(previewAbsolutePath) || fs.statSync(previewAbsolutePath).size === 0) {
    return {
      previewFilePath: null,
      conversionStatus: 'failed',
      conversionError: [result.stderr, result.stdout].filter(Boolean).join('\n').trim() || 'Word 转 PDF 失败'
    }
  }

  return {
    previewFilePath: previewRelativePath,
    conversionStatus: 'success',
    conversionError: null
  }
}

function fileExistsUnderData(relativePath) {
  if (!relativePath) return false
  const absolutePath = path.join(dataDir, relativePath)
  return absolutePath.startsWith(dataDir) && fs.existsSync(absolutePath)
}

function canView(row) {
  const category = row?.file_category || categoryFromFilename(row?.original_filename)
  if (category === 'document') {
    return row?.conversion_status === 'success' && fileExistsUnderData(row.preview_file_path)
  }
  return true
}

function enrichUploader(row) {
  if (!row) return row
  const uploader = row.created_by ? User.findById(row.created_by) : null
  return {
    ...row,
    uploader_username: uploader?.username || null,
    file_category: row.file_category || categoryFromFilename(row.original_filename),
    mime_type: row.mime_type || mimeTypeFromFilename(row.original_filename),
    file_format: formatFromFilename(row.original_filename),
    can_view: canView(row)
  }
}

function publicRow(row) {
  if (!row) return null
  return enrichUploader(row)
}

function definitionFromFilename(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase()
  return TYPE_BY_EXTENSION[ext] || null
}

function categoryFromFilename(filename) {
  return definitionFromFilename(filename)?.category || 'file'
}

function mimeTypeFromFilename(filename) {
  return definitionFromFilename(filename)?.mimeType || 'application/octet-stream'
}

function formatFromFilename(filename) {
  const definition = definitionFromFilename(filename)
  if (definition) return definition.label
  const ext = path.extname(String(filename || '')).replace('.', '').toUpperCase()
  return ext || '文件'
}

class ReadingMaterial {
  static validateUpload({ originalFilename, buffer }) {
    const definition = fileDefinitionFor(originalFilename)
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('上传文件不能为空')
    }
    if (buffer.length > definition.maxSize) {
      if (definition.category === 'document') throw new Error('Word 文件不能超过 200MB')
      if (definition.category === 'pdf') throw new Error('PDF 文件不能超过 200MB')
      if (definition.category === 'image') throw new Error('图片文件不能超过 20MB')
      throw new Error('HTML 文件不能超过 10MB')
    }
    return definition
  }

  static list(filters = {}) {
    const limit = Number(filters.limit || 50)
    const offset = Number(filters.offset || 0)
    const clauses = []
    const params = []

    if (filters.classId !== undefined && filters.classId !== null && filters.classId !== '') {
      clauses.push('class_id = ?')
      params.push(Number(filters.classId))
    }

    const keyword = String(filters.keyword || '').trim().toLowerCase()
    if (keyword) {
      clauses.push("(lower(title) LIKE ? OR lower(original_filename) LIKE ?)")
      params.push(`%${keyword}%`, `%${keyword}%`)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const order = String(filters.idOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'

    const rows = readingMaterialsDb.prepare(`
      SELECT id, class_id, title, original_filename, stored_filename, mime_type, file_category, preview_file_path, conversion_status, conversion_error, converted_at, file_size, content_hash, created_by, created_at, updated_at
      FROM reading_materials
      ${where}
      ORDER BY id ${order}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(publicRow)

    const total = readingMaterialsDb.prepare(`
      SELECT COUNT(*) AS total
      FROM reading_materials
      ${where}
    `).get(...params).total

    return { rows, total }
  }

  static findById(id) {
    return publicRow(readingMaterialsDb.prepare(`
      SELECT id, class_id, title, original_filename, stored_filename, file_path, mime_type, file_category, preview_file_path, conversion_status, conversion_error, converted_at, file_size, content_hash, created_by, created_at, updated_at
      FROM reading_materials
      WHERE id = ?
    `).get(id))
  }

  static fileAbsolutePath(row) {
    if (!row?.file_path) return null
    return path.join(dataDir, row.file_path)
  }

  static create({ classId, title, originalFilename, buffer, createdBy }) {
    const definition = this.validateUpload({ originalFilename, buffer })
    const original = definition.filename
    const stored = storedFilenameFor(original)
    const relativePath = path.join(STORAGE_DIR_NAME, stored)
    const absolutePath = path.join(STORAGE_DIR, stored)
    const hash = crypto.createHash('sha256').update(buffer).digest('hex')
    const resolvedTitle = normalizeText(title) || path.basename(original, path.extname(original))

    fs.writeFileSync(absolutePath, buffer)
    const conversion = definition.category === 'document'
      ? convertDocumentToPdf(absolutePath, stored)
      : { previewFilePath: null, conversionStatus: null, conversionError: null }

    const result = readingMaterialsDb.prepare(`
      INSERT INTO reading_materials (
        class_id,
        title,
        original_filename,
        stored_filename,
        file_path,
        mime_type,
        file_category,
        preview_file_path,
        conversion_status,
        conversion_error,
        converted_at,
        file_size,
        content_hash,
        created_by,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(
      Number(classId),
      resolvedTitle,
      original,
      stored,
      relativePath,
      definition.mimeType,
      definition.category,
      conversion.previewFilePath,
      conversion.conversionStatus,
      conversion.conversionError,
      conversion.conversionStatus === 'success' ? new Date().toISOString() : null,
      buffer.length,
      hash,
      createdBy || null
    )

    return result.lastInsertRowid
  }

  static update(id, payload) {
    return readingMaterialsDb.prepare(`
      UPDATE reading_materials
      SET title = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(normalizeText(payload.title), id)
  }

  static delete(id) {
    const row = this.findById(id)
    if (!row) return { changes: 0 }

    const result = readingMaterialsDb.prepare('DELETE FROM reading_materials WHERE id = ?').run(id)
    const absolutePath = this.fileAbsolutePath(row)
    if (absolutePath && absolutePath.startsWith(STORAGE_DIR) && fs.existsSync(absolutePath)) {
      fs.rmSync(absolutePath, { force: true })
    }
    const previewPath = this.previewAbsolutePath(row)
    if (previewPath && previewPath.startsWith(STORAGE_DIR) && fs.existsSync(previewPath)) {
      fs.rmSync(previewPath, { force: true })
    }
    return result
  }

  static counts() {
    const total = readingMaterialsDb.prepare('SELECT COUNT(*) AS total FROM reading_materials').get().total
    return { total }
  }

  static contentType(row) {
    return row?.mime_type || mimeTypeFromFilename(row?.original_filename)
  }

  static viewContentType(row) {
    return (row?.file_category || categoryFromFilename(row?.original_filename)) === 'document'
      ? 'application/pdf'
      : this.contentType(row)
  }

  static downloadFilename(row) {
    return sanitizeFilename(row?.original_filename || `${row?.title || 'reading-material'}.html`)
  }

  static viewFilename(row) {
    if ((row?.file_category || categoryFromFilename(row?.original_filename)) === 'document') {
      return `${path.basename(this.downloadFilename(row), path.extname(this.downloadFilename(row)))}.pdf`
    }
    return this.downloadFilename(row)
  }

  static previewAbsolutePath(row) {
    if (!row?.preview_file_path) return null
    return path.join(dataDir, row.preview_file_path)
  }

  static viewAbsolutePath(row) {
    if ((row?.file_category || categoryFromFilename(row?.original_filename)) === 'document') {
      return this.previewAbsolutePath(row)
    }
    return this.fileAbsolutePath(row)
  }

  static canView(row) {
    return canView(row)
  }

  static issueAccessToken(id) {
    const token = crypto.randomBytes(24).toString('hex')
    contentTokens.set(token, {
      id: Number(id),
      expiresAt: Date.now() + CONTENT_TOKEN_TTL_MS
    })
    return token
  }

  static resolveAccessToken(token) {
    const payload = contentTokens.get(String(token || ''))
    if (!payload) return null
    if (payload.expiresAt < Date.now()) {
      contentTokens.delete(String(token || ''))
      return null
    }
    return payload
  }
}

module.exports = {
  MAX_HTML_SIZE,
  MAX_IMAGE_SIZE,
  MAX_PDF_SIZE,
  MAX_DOCUMENT_SIZE,
  MAX_READING_MATERIAL_SIZE,
  ReadingMaterial
}
