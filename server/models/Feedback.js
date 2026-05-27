const { feedbackDb } = require('../database/db')

class Feedback {
  static create({ userId, username, satisfaction, comment }) {
    const result = feedbackDb.prepare(`
      INSERT INTO feedback (user_id, username, satisfaction, comment, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(userId, username, satisfaction, comment || null)

    return result.lastInsertRowid
  }

  static findByUserId(userId, limit = 50) {
    return feedbackDb.prepare(`
      SELECT *
      FROM feedback
      WHERE user_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ?
    `).all(userId, limit)
  }

  static list({ limit = 50, offset = 0, keyword = '', status = 'all', satisfaction = 0 } = {}) {
    const clauses = []
    const params = []

    if (status && status !== 'all') {
      clauses.push('status = ?')
      params.push(status)
    }

    if (Number(satisfaction) > 0) {
      clauses.push('satisfaction = ?')
      params.push(Number(satisfaction))
    }

    const term = String(keyword || '').trim().toLowerCase()
    if (term) {
      clauses.push("(CAST(id AS TEXT) LIKE ? OR CAST(user_id AS TEXT) LIKE ? OR lower(username) LIKE ? OR lower(COALESCE(comment, '')) LIKE ?)")
      params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = feedbackDb.prepare(`
      SELECT *
      FROM feedback
      ${where}
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)
    const total = feedbackDb.prepare(`SELECT COUNT(*) AS total FROM feedback ${where}`).get(...params).total

    return { rows, total }
  }

  static findById(id) {
    return feedbackDb.prepare('SELECT * FROM feedback WHERE id = ?').get(id)
  }

  static updateStatus(id, status, adminNote = null) {
    return feedbackDb.prepare(`
      UPDATE feedback
      SET status = ?, admin_note = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(status, adminNote, id)
  }

  static delete(id) {
    return feedbackDb.prepare('DELETE FROM feedback WHERE id = ?').run(id)
  }

  static statistics() {
    const total = feedbackDb.prepare('SELECT COUNT(*) AS total FROM feedback').get().total
    const average = feedbackDb.prepare('SELECT AVG(satisfaction) AS average FROM feedback').get().average || 0
    const open = feedbackDb.prepare("SELECT COUNT(*) AS total FROM feedback WHERE status = 'open'").get().total
    return {
      total,
      open,
      average: Number(average.toFixed ? average.toFixed(2) : average)
    }
  }
}

module.exports = Feedback
