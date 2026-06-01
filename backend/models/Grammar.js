const { grammarDb } = require('../database/db')

function normalizeText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

function normalizeExamples(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function parseExamples(value) {
  try {
    const examples = JSON.parse(value || '[]')
    return Array.isArray(examples) ? examples : []
  } catch (error) {
    return []
  }
}

function mapEntry(row) {
  if (!row) return null
  return {
    ...row,
    is_favorite: !!row.is_favorite,
    examples: parseExamples(row.examples_json)
  }
}

class Grammar {
  static options() {
    const textbooks = grammarDb.prepare(`
      SELECT id, name, description, order_index
      FROM textbooks
      ORDER BY order_index ASC, id ASC
    `).all()

    const lessons = grammarDb.prepare(`
      SELECT id, textbook_id, lesson_number, title
      FROM lessons
      ORDER BY lesson_number ASC, id ASC
    `).all()

    const units = grammarDb.prepare(`
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
      textbooks: Array.from(textbookMap.values())
    }
  }

  static list(filters = {}) {
    const limit = Number(filters.limit || 50)
    const offset = Number(filters.offset || 0)
    const clauses = []
    const params = []
    const joinParams = []
    const userId = Number(filters.userId || 0)
    const useFavoriteJoin = userId > 0

    if (filters.textbookId) {
      clauses.push('g.textbook_id = ?')
      params.push(Number(filters.textbookId))
    }

    if (filters.lessonId) {
      clauses.push('g.lesson_id = ?')
      params.push(Number(filters.lessonId))
    }

    if (filters.lessonNumberMin) {
      clauses.push('l.lesson_number >= ?')
      params.push(Number(filters.lessonNumberMin))
    }

    if (filters.lessonNumberMax) {
      clauses.push('l.lesson_number <= ?')
      params.push(Number(filters.lessonNumberMax))
    }

    if (filters.unitId) {
      clauses.push('g.unit_id = ?')
      params.push(Number(filters.unitId))
    }

    const keyword = String(filters.keyword || '').trim().toLowerCase()
    if (keyword) {
      clauses.push('lower(g.grammar) LIKE ?')
      params.push(`%${keyword}%`)
    }

    if (useFavoriteJoin && filters.favoritesOnly) {
      clauses.push('gf.id IS NOT NULL')
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const order = String(filters.idOrder || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'
    const favoriteJoin = useFavoriteJoin
      ? 'LEFT JOIN grammar_favorites gf ON gf.grammar_id = g.id AND gf.user_id = ?'
      : ''
    const favoriteSelect = useFavoriteJoin
      ? 'CASE WHEN gf.id IS NULL THEN 0 ELSE 1 END AS is_favorite,'
      : '0 AS is_favorite,'

    if (useFavoriteJoin) joinParams.push(userId)

    const rows = grammarDb.prepare(`
      SELECT
        g.id,
        g.textbook_id,
        g.lesson_id,
        g.unit_id,
        g.grammar,
        g.brief_logic,
        g.order_index,
        ${favoriteSelect}
        t.name AS textbook_name,
        l.lesson_number,
        l.title AS lesson_title,
        u.unit_number,
        u.name AS unit_name
      FROM grammar_entries g
      ${favoriteJoin}
      JOIN textbooks t ON t.id = g.textbook_id
      JOIN lessons l ON l.id = g.lesson_id
      JOIN units u ON u.id = g.unit_id
      ${where}
      ORDER BY CAST(g.id AS INTEGER) ${order}
      LIMIT ? OFFSET ?
    `).all(...joinParams, ...params, limit, offset).map((row) => ({
      ...row,
      is_favorite: !!row.is_favorite
    }))

    const total = grammarDb.prepare(`
      SELECT COUNT(*) AS total
      FROM grammar_entries g
      ${favoriteJoin}
      JOIN textbooks t ON t.id = g.textbook_id
      JOIN lessons l ON l.id = g.lesson_id
      JOIN units u ON u.id = g.unit_id
      ${where}
    `).get(...joinParams, ...params).total

    return { rows, total }
  }

  static findById(id) {
    return mapEntry(grammarDb.prepare(`
      SELECT
        g.*,
        t.name AS textbook_name,
        l.lesson_number,
        l.title AS lesson_title,
        u.unit_number,
        u.name AS unit_name
      FROM grammar_entries g
      JOIN textbooks t ON t.id = g.textbook_id
      JOIN lessons l ON l.id = g.lesson_id
      JOIN units u ON u.id = g.unit_id
      WHERE g.id = ?
    `).get(id))
  }

  static contextExists({ textbook_id, lesson_id, unit_id }) {
    const row = grammarDb.prepare(`
      SELECT u.id
      FROM units u
      JOIN lessons l ON l.id = u.lesson_id
      JOIN textbooks t ON t.id = l.textbook_id
      WHERE t.id = ? AND l.id = ? AND u.id = ?
    `).get(textbook_id, lesson_id, unit_id)
    return !!row
  }

  static create(payload) {
    const result = grammarDb.prepare(`
      INSERT INTO grammar_entries (
        textbook_id,
        lesson_id,
        unit_id,
        grammar,
        brief_logic,
        meaning,
        translation,
        formation,
        notes,
        examples_json,
        order_index,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(
      Number(payload.textbook_id),
      Number(payload.lesson_id),
      Number(payload.unit_id),
      normalizeText(payload.grammar),
      normalizeText(payload.brief_logic),
      normalizeText(payload.meaning),
      normalizeText(payload.translation),
      normalizeText(payload.formation),
      normalizeText(payload.notes),
      JSON.stringify(normalizeExamples(payload.examples)),
      Number(payload.order_index || 0)
    )
    return result.lastInsertRowid
  }

  static update(id, payload) {
    return grammarDb.prepare(`
      UPDATE grammar_entries
      SET
        grammar = ?,
        brief_logic = ?,
        meaning = ?,
        translation = ?,
        formation = ?,
        notes = ?,
        examples_json = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      normalizeText(payload.grammar),
      normalizeText(payload.brief_logic),
      normalizeText(payload.meaning),
      normalizeText(payload.translation),
      normalizeText(payload.formation),
      normalizeText(payload.notes),
      JSON.stringify(normalizeExamples(payload.examples)),
      id
    )
  }

  static delete(id) {
    return grammarDb.prepare('DELETE FROM grammar_entries WHERE id = ?').run(id)
  }

  static setFavorite(userId, grammarId, favorite = true) {
    if (favorite) {
      grammarDb.prepare(`
        INSERT OR IGNORE INTO grammar_favorites (user_id, grammar_id)
        VALUES (?, ?)
      `).run(Number(userId), Number(grammarId))
      return
    }

    grammarDb.prepare(`
      DELETE FROM grammar_favorites
      WHERE user_id = ? AND grammar_id = ?
    `).run(Number(userId), Number(grammarId))
  }

  static counts() {
    const total = grammarDb.prepare('SELECT COUNT(*) AS total FROM grammar_entries').get().total
    const textbooks = grammarDb.prepare('SELECT COUNT(*) AS total FROM textbooks').get().total
    const lessons = grammarDb.prepare('SELECT COUNT(*) AS total FROM lessons').get().total
    const units = grammarDb.prepare('SELECT COUNT(*) AS total FROM units').get().total
    return { total, textbooks, lessons, units }
  }
}

module.exports = {
  Grammar
}
