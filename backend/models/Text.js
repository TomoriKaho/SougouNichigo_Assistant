const { textDb, vocabularyDb, grammarDb } = require('../database/db')

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

  static studyById(id, userId) {
    const item = this.findById(id)
    if (!item) return null

    const vocabulary = vocabularyDb.prepare(`
      SELECT
        v.*,
        CASE WHEN vf.id IS NULL THEN 0 ELSE 1 END AS is_favorite,
        t.name AS textbook_name,
        l.lesson_number,
        l.title AS lesson_title,
        u.unit_number,
        u.name AS unit_name
      FROM vocabulary_entries v
      LEFT JOIN vocabulary_favorites vf ON vf.vocabulary_id = v.id AND vf.user_id = ?
      JOIN textbooks t ON t.id = v.textbook_id
      JOIN lessons l ON l.id = v.lesson_id
      JOIN units u ON u.id = v.unit_id
      WHERE t.name = ?
        AND l.lesson_number = ?
        AND u.unit_number = ?
      ORDER BY length(v.term) DESC, v.id ASC
    `).all(
      Number(userId),
      item.textbook_name,
      Number(item.lesson_number || 0),
      Number(item.unit_number || 0)
    ).map((row) => ({
      ...row,
      is_favorite: !!row.is_favorite,
      is_proper_noun: !!row.is_proper_noun,
      is_onomatopoeia: !!row.is_onomatopoeia,
      is_loanword: !!row.is_loanword,
      has_kanji: !!row.has_kanji,
      is_key_word: !!row.is_key_word
    }))

    const grammar = grammarDb.prepare(`
      SELECT
        g.id,
        g.textbook_id,
        g.lesson_id,
        g.unit_id,
        g.grammar,
        g.brief_logic,
        g.meaning,
        g.translation,
        g.formation,
        g.notes,
        CASE WHEN gf.id IS NULL THEN 0 ELSE 1 END AS is_favorite,
        t.name AS textbook_name,
        l.lesson_number,
        l.title AS lesson_title,
        u.unit_number,
        u.name AS unit_name
      FROM grammar_entries g
      LEFT JOIN grammar_favorites gf ON gf.grammar_id = g.id AND gf.user_id = ?
      JOIN textbooks t ON t.id = g.textbook_id
      JOIN lessons l ON l.id = g.lesson_id
      JOIN units u ON u.id = g.unit_id
      WHERE t.name = ?
        AND l.lesson_number = ?
        AND u.unit_number = ?
      ORDER BY length(g.grammar) DESC, g.id ASC
    `).all(
      Number(userId),
      item.textbook_name,
      Number(item.lesson_number || 0),
      Number(item.unit_number || 0)
    ).map((row) => ({
      ...row,
      is_favorite: !!row.is_favorite
    }))

    return {
      item,
      vocabulary,
      grammar
    }
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
