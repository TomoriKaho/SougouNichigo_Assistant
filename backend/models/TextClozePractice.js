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

function mapSet(row) {
  if (!row) return null
  const item = {
    ...row,
    vocabulary: safeParseJson(row.vocabulary_json, []),
    grammar: safeParseJson(row.grammar_json, []),
    questions: safeParseJson(row.questions_json, []),
    source_candidates: safeParseJson(row.source_candidates_json, [])
  }
  delete item.vocabulary_json
  delete item.grammar_json
  delete item.questions_json
  delete item.source_candidates_json
  return item
}

function mapAttempt(row, { includeSet = false } = {}) {
  if (!row) return null
  const item = {
    ...row,
    answers: safeParseJson(row.answers_json, {}),
    result: safeParseJson(row.result_json, {})
  }
  delete item.answers_json
  delete item.result_json

  if (includeSet) {
    item.practice_set = mapSet({
      id: row.set_id,
      text_id: row.set_text_id,
      textbook_name: row.textbook_name,
      lesson_number: row.lesson_number,
      unit_number: row.unit_number,
      text_title: row.text_title,
      content_snapshot: row.content_snapshot,
      question_count: row.question_count,
      vocabulary_json: row.vocabulary_json,
      grammar_json: row.grammar_json,
      questions_json: row.questions_json,
      source_candidates_json: row.source_candidates_json,
      created_by: row.set_created_by,
      created_at: row.set_created_at,
      updated_at: row.set_updated_at
    })
  }

  return item
}

class TextClozePractice {
  static createSet(payload) {
    const result = userDb.prepare(`
      INSERT INTO text_cloze_practice_sets (
        text_id,
        textbook_name,
        lesson_number,
        unit_number,
        text_title,
        content_snapshot,
        question_count,
        vocabulary_json,
        grammar_json,
        questions_json,
        source_candidates_json,
        created_by,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(
      Number(payload.textId),
      String(payload.textbookName || ''),
      Number(payload.lessonNumber || 0),
      Number(payload.unitNumber || 0),
      String(payload.textTitle || ''),
      String(payload.contentSnapshot || ''),
      Number(payload.questionCount || 0),
      stringify(payload.vocabulary, []),
      stringify(payload.grammar, []),
      stringify(payload.questions, []),
      stringify(payload.sourceCandidates, []),
      payload.createdBy ? Number(payload.createdBy) : null
    )

    return this.findSetById(result.lastInsertRowid)
  }

  static findSetById(id) {
    const row = userDb.prepare(`
      SELECT *
      FROM text_cloze_practice_sets
      WHERE id = ?
    `).get(Number(id))
    return mapSet(row)
  }

  static findReusableSet({ textId, userId }) {
    const row = userDb.prepare(`
      SELECT s.*
      FROM text_cloze_practice_sets s
      WHERE s.text_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM text_cloze_attempts a
          WHERE a.user_id = ?
            AND a.set_id = s.id
        )
      ORDER BY datetime(s.created_at) ASC, s.id ASC
      LIMIT 1
    `).get(Number(textId), Number(userId))
    return mapSet(row)
  }

  static hasAttemptForSet({ userId, setId }) {
    const row = userDb.prepare(`
      SELECT id
      FROM text_cloze_attempts
      WHERE user_id = ? AND set_id = ?
      LIMIT 1
    `).get(Number(userId), Number(setId))
    return !!row
  }

  static createAttempt({ userId, setId, textId, answers, result }) {
    const insert = userDb.prepare(`
      INSERT INTO text_cloze_attempts (
        user_id,
        set_id,
        text_id,
        answers_json,
        result_json,
        submitted_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'), datetime('now', 'localtime'))
    `)
    const row = insert.run(
      Number(userId),
      Number(setId),
      Number(textId),
      stringify(answers, {}),
      stringify(result, {})
    )
    return this.findAttemptById(row.lastInsertRowid, userId)
  }

  static findAttemptById(id, userId) {
    const row = userDb.prepare(`
      SELECT
        a.*,
        s.id AS set_id,
        s.text_id AS set_text_id,
        s.textbook_name,
        s.lesson_number,
        s.unit_number,
        s.text_title,
        s.content_snapshot,
        s.question_count,
        s.vocabulary_json,
        s.grammar_json,
        s.questions_json,
        s.source_candidates_json,
        s.created_by AS set_created_by,
        s.created_at AS set_created_at,
        s.updated_at AS set_updated_at
      FROM text_cloze_attempts a
      JOIN text_cloze_practice_sets s ON s.id = a.set_id
      WHERE a.id = ? AND a.user_id = ?
    `).get(Number(id), Number(userId))
    return mapAttempt(row, { includeSet: true })
  }

  static listAttemptsForText({ userId, textId, limit = 20, offset = 0 }) {
    const rows = userDb.prepare(`
      SELECT
        a.*,
        s.id AS set_id,
        s.text_id AS set_text_id,
        s.textbook_name,
        s.lesson_number,
        s.unit_number,
        s.text_title,
        s.content_snapshot,
        s.question_count,
        s.vocabulary_json,
        s.grammar_json,
        s.questions_json,
        s.source_candidates_json,
        s.created_by AS set_created_by,
        s.created_at AS set_created_at,
        s.updated_at AS set_updated_at
      FROM text_cloze_attempts a
      JOIN text_cloze_practice_sets s ON s.id = a.set_id
      WHERE a.user_id = ?
        AND a.text_id = ?
      ORDER BY datetime(a.submitted_at) DESC, a.id DESC
      LIMIT ? OFFSET ?
    `).all(Number(userId), Number(textId), Number(limit), Number(offset)).map((row) => mapAttempt(row, { includeSet: true }))

    const total = userDb.prepare(`
      SELECT COUNT(*) AS total
      FROM text_cloze_attempts
      WHERE user_id = ? AND text_id = ?
    `).get(Number(userId), Number(textId)).total

    return { rows, total }
  }

  static deleteAttempt({ userId, attemptId }) {
    return userDb.prepare(`
      DELETE FROM text_cloze_attempts
      WHERE id = ? AND user_id = ?
    `).run(Number(attemptId), Number(userId)).changes > 0
  }
}

module.exports = {
  TextClozePractice
}
