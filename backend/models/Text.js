const { textDb } = require('../database/db')

function normalizeText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

function mapEntry(row) {
  if (!row) return null
  return row
}

class Text {
  static options() {
    const textbooks = textDb.prepare(`
      SELECT id, name, description, order_index
      FROM textbooks
      ORDER BY order_index ASC, id ASC
    `).all()

    return { textbooks }
  }

  static list(filters = {}) {
    const limit = Number(filters.limit || 50)
    const offset = Number(filters.offset || 0)
    const clauses = []
    const params = []

    if (filters.textbookId) {
      clauses.push('e.textbook_id = ?')
      params.push(Number(filters.textbookId))
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const order = String(filters.idOrder || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'

    const rows = textDb.prepare(`
      SELECT
        e.id,
        e.textbook_id,
        e.lesson_number,
        e.unit_number,
        e.title,
        e.order_index,
        t.name AS textbook_name
      FROM text_entries e
      JOIN textbooks t ON t.id = e.textbook_id
      ${where}
      ORDER BY e.lesson_number ${order}, e.unit_number ${order}, e.id ${order}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapEntry)

    const total = textDb.prepare(`
      SELECT COUNT(*) AS total
      FROM text_entries e
      JOIN textbooks t ON t.id = e.textbook_id
      ${where}
    `).get(...params).total

    return { rows, total }
  }

  static findById(id) {
    return mapEntry(textDb.prepare(`
      SELECT
        e.*,
        t.name AS textbook_name
      FROM text_entries e
      JOIN textbooks t ON t.id = e.textbook_id
      WHERE e.id = ?
    `).get(id))
  }

  static textbookExists(textbookId) {
    const row = textDb.prepare('SELECT id FROM textbooks WHERE id = ?').get(textbookId)
    return !!row
  }

  static create(payload) {
    const result = textDb.prepare(`
      INSERT INTO text_entries (
        textbook_id,
        lesson_number,
        unit_number,
        title,
        content,
        order_index,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(
      Number(payload.textbook_id),
      Number(payload.lesson_number || 0),
      Number(payload.unit_number || 0),
      normalizeText(payload.title),
      normalizeText(payload.content) || '',
      Number(payload.order_index || 0)
    )
    return result.lastInsertRowid
  }

  static update(id, payload) {
    return textDb.prepare(`
      UPDATE text_entries
      SET
        lesson_number = ?,
        unit_number = ?,
        title = ?,
        content = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      Number(payload.lesson_number || 0),
      Number(payload.unit_number || 0),
      normalizeText(payload.title),
      normalizeText(payload.content) || '',
      id
    )
  }

  static delete(id) {
    return textDb.prepare('DELETE FROM text_entries WHERE id = ?').run(id)
  }

  static counts() {
    const total = textDb.prepare('SELECT COUNT(*) AS total FROM text_entries').get().total
    const textbooks = textDb.prepare('SELECT COUNT(*) AS total FROM textbooks').get().total
    return { total, textbooks }
  }
}

module.exports = {
  Text
}
