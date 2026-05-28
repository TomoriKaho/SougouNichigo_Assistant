const { feedbackDb } = require('../database/db')

const FEEDBACK_TYPES = ['内容错误', '页面交互', '新功能请求', '其他']

function normalizeFeedbackType(value) {
  const feedbackType = String(value || '').trim()
  return FEEDBACK_TYPES.includes(feedbackType) ? feedbackType : ''
}

class Feedback {
  static create({ userId, feedbackType, content }) {
    const normalizedType = normalizeFeedbackType(feedbackType)
    const normalizedContent = String(content || '').trim()

    if (!normalizedType) throw new Error('反馈类型无效')
    if (!normalizedContent) throw new Error('反馈内容不能为空')

    const result = feedbackDb.prepare(`
      INSERT INTO feedback (user_id, feedback_type, content, created_at)
      VALUES (?, ?, ?, datetime('now', 'localtime'))
    `).run(userId, normalizedType, normalizedContent)

    return result.lastInsertRowid
  }

  static findByUserId(userId, limit = 50) {
    return feedbackDb.prepare(`
      SELECT id, user_id, feedback_type, content, created_at
      FROM feedback
      WHERE user_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ?
    `).all(userId, limit)
  }

  static list({ limit = 50, offset = 0, keyword = '', feedbackType = 'all' } = {}) {
    const clauses = []
    const params = []
    const normalizedType = normalizeFeedbackType(feedbackType)

    if (normalizedType) {
      clauses.push('feedback_type = ?')
      params.push(normalizedType)
    }

    const term = String(keyword || '').trim().toLowerCase()
    if (term) {
      clauses.push("(CAST(id AS TEXT) LIKE ? OR CAST(user_id AS TEXT) LIKE ? OR lower(feedback_type) LIKE ? OR lower(content) LIKE ?)")
      params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = feedbackDb.prepare(`
      SELECT id, user_id, feedback_type, content, created_at
      FROM feedback
      ${where}
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)
    const total = feedbackDb.prepare(`SELECT COUNT(*) AS total FROM feedback ${where}`).get(...params).total

    return { rows, total }
  }

  static findById(id) {
    return feedbackDb.prepare(`
      SELECT id, user_id, feedback_type, content, created_at
      FROM feedback
      WHERE id = ?
    `).get(id)
  }

  static delete(id) {
    return feedbackDb.prepare('DELETE FROM feedback WHERE id = ?').run(id)
  }

  static statistics() {
    return {
      total: feedbackDb.prepare('SELECT COUNT(*) AS total FROM feedback').get().total
    }
  }
}

module.exports = {
  Feedback,
  FEEDBACK_TYPES,
  normalizeFeedbackType
}
