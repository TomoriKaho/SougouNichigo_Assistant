const { userDb } = require('../database/db')

function safeParseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '')
    return parsed ?? fallback
  } catch (error) {
    return fallback
  }
}

function stringify(value, fallback) {
  return JSON.stringify(value ?? fallback)
}

function mapPractice(row, { includeMessages = false } = {}) {
  if (!row) return null
  const item = {
    ...row,
    grammar: safeParseJson(row.grammar_json, []),
    vocabulary: safeParseJson(row.vocabulary_json, []),
    exercise: safeParseJson(row.exercise_json, {}),
    answer: safeParseJson(row.answer_json, null),
    review: safeParseJson(row.review_json, null)
  }
  delete item.grammar_json
  delete item.vocabulary_json
  delete item.exercise_json
  delete item.answer_json
  delete item.review_json

  if (includeMessages) {
    item.messages = TranslationPractice.messages(row.id, row.user_id)
  }
  return item
}

class TranslationPractice {
  static create(payload) {
    const result = userDb.prepare(`
      INSERT INTO translation_practices (
        user_id,
        textbook_id,
        textbook_name,
        range_key,
        range_label,
        lesson_min,
        lesson_max,
        ability_label,
        status,
        grammar_json,
        vocabulary_json,
        exercise_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(
      Number(payload.userId),
      Number(payload.textbookId),
      String(payload.textbookName || ''),
      String(payload.rangeKey || ''),
      String(payload.rangeLabel || ''),
      Number(payload.lessonMin || 0),
      Number(payload.lessonMax || 0),
      String(payload.abilityLabel || ''),
      String(payload.status || 'draft'),
      stringify(payload.grammar, []),
      stringify(payload.vocabulary, []),
      stringify(payload.exercise, {})
    )

    return this.findOwnedById(result.lastInsertRowid, payload.userId)
  }

  static findOwnedById(id, userId, options = {}) {
    const row = userDb.prepare(`
      SELECT *
      FROM translation_practices
      WHERE id = ? AND user_id = ?
    `).get(Number(id), Number(userId))
    return mapPractice(row, options)
  }

  static listOwned({ userId, limit = 20, offset = 0 } = {}) {
    const rows = userDb.prepare(`
      SELECT *
      FROM translation_practices
      WHERE user_id = ?
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(Number(userId), Number(limit), Number(offset)).map(mapPractice)

    const total = userDb.prepare(`
      SELECT COUNT(*) AS total
      FROM translation_practices
      WHERE user_id = ?
    `).get(Number(userId)).total

    return { rows, total }
  }

  static saveReview(id, userId, { answer, review }) {
    userDb.prepare(`
      UPDATE translation_practices
      SET
        status = 'reviewed',
        answer_json = ?,
        review_json = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ? AND user_id = ?
    `).run(
      stringify(answer, {}),
      stringify(review, {}),
      Number(id),
      Number(userId)
    )

    return this.findOwnedById(id, userId, { includeMessages: true })
  }

  static saveAnswers(id, userId, { answer }) {
    userDb.prepare(`
      UPDATE translation_practices
      SET
        answer_json = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ? AND user_id = ? AND status != 'reviewed'
    `).run(
      stringify(answer, {}),
      Number(id),
      Number(userId)
    )

    return this.findOwnedById(id, userId, { includeMessages: true })
  }

  static deleteOwnedById(id, userId) {
    const practiceId = Number(id)
    const ownerId = Number(userId)
    const transaction = userDb.transaction(() => {
      userDb.prepare(`
        DELETE FROM translation_practice_messages
        WHERE practice_id = ? AND user_id = ?
      `).run(practiceId, ownerId)
      return userDb.prepare(`
        DELETE FROM translation_practices
        WHERE id = ? AND user_id = ?
      `).run(practiceId, ownerId)
    })
    return transaction().changes > 0
  }

  static addMessage({ practiceId, userId, role, content }) {
    const result = userDb.prepare(`
      INSERT INTO translation_practice_messages (
        practice_id,
        user_id,
        role,
        content,
        created_at
      )
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(
      Number(practiceId),
      Number(userId),
      String(role || ''),
      String(content || '')
    )
    return userDb.prepare(`
      SELECT id, practice_id, user_id, role, content, created_at
      FROM translation_practice_messages
      WHERE id = ?
    `).get(result.lastInsertRowid)
  }

  static messages(practiceId, userId) {
    return userDb.prepare(`
      SELECT id, practice_id, user_id, role, content, created_at
      FROM translation_practice_messages
      WHERE practice_id = ? AND user_id = ?
      ORDER BY datetime(created_at) ASC, id ASC
    `).all(Number(practiceId), Number(userId))
  }
}

module.exports = {
  TranslationPractice
}
