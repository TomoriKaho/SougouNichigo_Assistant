const { userDb } = require('../database/db')
const { Text } = require('./Text')

function normalizeText(value) {
  return String(value || '').trim()
}

function mapNote(row) {
  if (!row) return null
  return {
    ...row,
    start_offset: Number(row.start_offset),
    end_offset: Number(row.end_offset)
  }
}

function validateSelection(textItem, payload = {}) {
  const content = String(textItem?.content || '')
  const startOffset = Number(payload.startOffset ?? payload.start_offset)
  const endOffset = Number(payload.endOffset ?? payload.end_offset)
  const selectedText = String(payload.selectedText ?? payload.selected_text ?? '')

  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)) {
    const error = new Error('选区位置无效')
    error.status = 400
    throw error
  }

  if (startOffset < 0 || endOffset <= startOffset || endOffset > content.length) {
    const error = new Error('选区范围超出课文内容')
    error.status = 400
    throw error
  }

  const contentSlice = content.slice(startOffset, endOffset)
  if (!selectedText.trim() || contentSlice !== selectedText) {
    const error = new Error('选区内容与课文不一致，请重新选择')
    error.status = 400
    throw error
  }

  return {
    startOffset,
    endOffset,
    selectedText
  }
}

class TextNote {
  static listForText(userId, textId) {
    return userDb.prepare(`
      SELECT *
      FROM text_notes
      WHERE user_id = ? AND text_id = ?
      ORDER BY start_offset ASC, id ASC
    `).all(Number(userId), Number(textId)).map(mapNote)
  }

  static findOwnedById(userId, id) {
    return mapNote(userDb.prepare(`
      SELECT *
      FROM text_notes
      WHERE id = ? AND user_id = ?
    `).get(Number(id), Number(userId)))
  }

  static create(userId, textId, payload = {}) {
    const textItem = Text.findById(textId)
    if (!textItem) {
      const error = new Error('课文条目不存在')
      error.status = 404
      throw error
    }

    const selection = validateSelection(textItem, payload)
    const noteContent = normalizeText(payload.noteContent ?? payload.note_content)
    if (!noteContent) {
      const error = new Error('请输入笔记内容')
      error.status = 400
      throw error
    }

    const result = userDb.prepare(`
      INSERT INTO text_notes (
        user_id,
        text_id,
        start_offset,
        end_offset,
        selected_text,
        note_content,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(
      Number(userId),
      Number(textId),
      selection.startOffset,
      selection.endOffset,
      selection.selectedText,
      noteContent
    )

    return this.findOwnedById(userId, result.lastInsertRowid)
  }

  static update(userId, id, payload = {}) {
    const note = this.findOwnedById(userId, id)
    if (!note) return null

    const noteContent = normalizeText(payload.noteContent ?? payload.note_content)
    if (!noteContent) {
      const error = new Error('请输入笔记内容')
      error.status = 400
      throw error
    }

    userDb.prepare(`
      UPDATE text_notes
      SET note_content = ?,
          updated_at = datetime('now', 'localtime')
      WHERE id = ? AND user_id = ?
    `).run(noteContent, Number(id), Number(userId))

    return this.findOwnedById(userId, id)
  }

  static delete(userId, id) {
    const result = userDb.prepare(`
      DELETE FROM text_notes
      WHERE id = ? AND user_id = ?
    `).run(Number(id), Number(userId))
    return result.changes > 0
  }

  static validateSelectionForText(textId, payload = {}) {
    const textItem = Text.findById(textId)
    if (!textItem) return null
    return {
      item: textItem,
      selection: validateSelection(textItem, payload)
    }
  }
}

module.exports = {
  TextNote
}
