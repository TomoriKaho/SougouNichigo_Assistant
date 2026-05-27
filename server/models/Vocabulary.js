const { vocabularyDb } = require('../database/db')

const TABLE_TYPE_LABELS = {
  new: '新出単語',
  practice: '練習用単語'
}

function normalizeText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

function mapEntry(row) {
  if (!row) return null
  return {
    ...row,
    table_type_label: TABLE_TYPE_LABELS[row.table_type] || row.source_table_label || row.table_type
  }
}

class Vocabulary {
  static options() {
    const textbooks = vocabularyDb.prepare(`
      SELECT id, name, description, order_index
      FROM textbooks
      ORDER BY order_index ASC, id ASC
    `).all()

    const lessons = vocabularyDb.prepare(`
      SELECT id, textbook_id, lesson_number, title
      FROM lessons
      ORDER BY lesson_number ASC, id ASC
    `).all()

    const units = vocabularyDb.prepare(`
      SELECT u.id, u.lesson_id, u.unit_number, u.name, l.textbook_id
      FROM units u
      JOIN lessons l ON l.id = u.lesson_id
      ORDER BY l.lesson_number ASC, u.unit_number ASC, u.id ASC
    `).all()

    const lessonMap = new Map()
    lessons.forEach((lesson) => lessonMap.set(lesson.id, { ...lesson, units: [] }))
    units.forEach((unit) => {
      const lesson = lessonMap.get(unit.lesson_id)
      if (lesson) lesson.units.push(unit)
    })

    const textbookMap = new Map(textbooks.map((textbook) => [textbook.id, { ...textbook, lessons: [] }]))
    lessonMap.forEach((lesson) => {
      const textbook = textbookMap.get(lesson.textbook_id)
      if (textbook) textbook.lessons.push(lesson)
    })

    return {
      textbooks: Array.from(textbookMap.values()),
      tableTypes: [
        { value: 'new', label: TABLE_TYPE_LABELS.new },
        { value: 'practice', label: TABLE_TYPE_LABELS.practice }
      ]
    }
  }

  static list(filters = {}) {
    const limit = Number(filters.limit || 50)
    const offset = Number(filters.offset || 0)
    const clauses = []
    const params = []

    if (filters.textbookId) {
      clauses.push('v.textbook_id = ?')
      params.push(Number(filters.textbookId))
    }

    if (filters.lessonId) {
      clauses.push('v.lesson_id = ?')
      params.push(Number(filters.lessonId))
    }

    if (filters.unitId) {
      clauses.push('v.unit_id = ?')
      params.push(Number(filters.unitId))
    }

    if (filters.tableType && filters.tableType !== 'all') {
      clauses.push('v.table_type = ?')
      params.push(String(filters.tableType))
    }

    const keyword = String(filters.keyword || '').trim().toLowerCase()
    if (keyword) {
      clauses.push("(lower(v.term) LIKE ? OR lower(COALESCE(v.supplement, '')) LIKE ? OR CAST(v.id AS TEXT) LIKE ?)")
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const order = String(filters.idOrder || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'

    const rows = vocabularyDb.prepare(`
      SELECT
        v.*,
        t.name AS textbook_name,
        l.lesson_number,
        l.title AS lesson_title,
        u.unit_number,
        u.name AS unit_name
      FROM vocabulary_entries v
      JOIN textbooks t ON t.id = v.textbook_id
      JOIN lessons l ON l.id = v.lesson_id
      JOIN units u ON u.id = v.unit_id
      ${where}
      ORDER BY CAST(v.id AS INTEGER) ${order}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapEntry)

    const total = vocabularyDb.prepare(`
      SELECT COUNT(*) AS total
      FROM vocabulary_entries v
      JOIN textbooks t ON t.id = v.textbook_id
      JOIN lessons l ON l.id = v.lesson_id
      JOIN units u ON u.id = v.unit_id
      ${where}
    `).get(...params).total

    return { rows, total }
  }

  static findById(id) {
    return mapEntry(vocabularyDb.prepare(`
      SELECT
        v.*,
        t.name AS textbook_name,
        l.lesson_number,
        l.title AS lesson_title,
        u.unit_number,
        u.name AS unit_name
      FROM vocabulary_entries v
      JOIN textbooks t ON t.id = v.textbook_id
      JOIN lessons l ON l.id = v.lesson_id
      JOIN units u ON u.id = v.unit_id
      WHERE v.id = ?
    `).get(id))
  }

  static contextExists({ textbook_id, lesson_id, unit_id }) {
    const row = vocabularyDb.prepare(`
      SELECT u.id
      FROM units u
      JOIN lessons l ON l.id = u.lesson_id
      JOIN textbooks t ON t.id = l.textbook_id
      WHERE t.id = ? AND l.id = ? AND u.id = ?
    `).get(textbook_id, lesson_id, unit_id)
    return !!row
  }

  static create(payload) {
    const tableType = payload.table_type === 'practice' ? 'practice' : 'new'
    const sourceLabel = TABLE_TYPE_LABELS[tableType]
    const result = vocabularyDb.prepare(`
      INSERT INTO vocabulary_entries (
        textbook_id,
        lesson_id,
        unit_id,
        table_type,
        source_table_label,
        term,
        supplement,
        accent,
        part_of_speech,
        explanation,
        order_index,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(
      Number(payload.textbook_id),
      Number(payload.lesson_id),
      Number(payload.unit_id),
      tableType,
      sourceLabel,
      normalizeText(payload.term),
      normalizeText(payload.supplement),
      normalizeText(payload.accent),
      normalizeText(payload.part_of_speech),
      normalizeText(payload.explanation),
      Number(payload.order_index || 0)
    )
    return result.lastInsertRowid
  }

  static update(id, payload) {
    return vocabularyDb.prepare(`
      UPDATE vocabulary_entries
      SET
        term = ?,
        supplement = ?,
        accent = ?,
        part_of_speech = ?,
        explanation = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      normalizeText(payload.term),
      normalizeText(payload.supplement),
      normalizeText(payload.accent),
      normalizeText(payload.part_of_speech),
      normalizeText(payload.explanation),
      id
    )
  }

  static delete(id) {
    return vocabularyDb.prepare('DELETE FROM vocabulary_entries WHERE id = ?').run(id)
  }

  static counts() {
    const total = vocabularyDb.prepare('SELECT COUNT(*) AS total FROM vocabulary_entries').get().total
    const textbooks = vocabularyDb.prepare('SELECT COUNT(*) AS total FROM textbooks').get().total
    const lessons = vocabularyDb.prepare('SELECT COUNT(*) AS total FROM lessons').get().total
    const units = vocabularyDb.prepare('SELECT COUNT(*) AS total FROM units').get().total
    return { total, textbooks, lessons, units }
  }
}

module.exports = {
  Vocabulary,
  TABLE_TYPE_LABELS
}
