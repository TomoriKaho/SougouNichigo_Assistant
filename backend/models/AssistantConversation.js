const { userDb } = require('../database/db')

const CONTEXT_TYPES = new Set(['none', 'vocabulary', 'grammar', 'text'])
const VISIBILITIES = new Set(['private', 'context_shared'])
const MESSAGE_ROLES = new Set(['user', 'assistant'])

function normalizeContextType(value) {
  const normalized = String(value || 'none').trim()
  return CONTEXT_TYPES.has(normalized) ? normalized : 'none'
}

function normalizeVisibility(value) {
  const normalized = String(value || 'private').trim()
  return VISIBILITIES.has(normalized) ? normalized : 'private'
}

function normalizeRole(value) {
  const normalized = String(value || '').trim()
  return MESSAGE_ROLES.has(normalized) ? normalized : 'user'
}

function parseJson(value, fallback = null) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

function mapConversation(row) {
  if (!row) return null
  const snapshot = parseJson(row.context_snapshot_json)
  return {
    ...row,
    context_snapshot: snapshot,
    is_shared: row.visibility === 'context_shared',
    last_message_at: row.last_message_at || row.updated_at,
    last_message_excerpt: row.last_message_excerpt || ''
  }
}

function mapMessage(row) {
  if (!row) return null
  return {
    ...row,
    used_web_search: !!row.used_web_search,
    citations: parseJson(row.citations_json, [])
  }
}

class AssistantConversation {
  static hasUserQuestionClause(alias = 'c') {
    return `
      EXISTS (
        SELECT 1
        FROM assistant_messages hm
        WHERE hm.conversation_id = ${alias}.id
          AND hm.role = 'user'
      )
    `
  }

  static create(payload = {}) {
    const contextType = normalizeContextType(payload.contextType)
    const visibility = normalizeVisibility(payload.visibility)
    const contextId = payload.contextId ? Number(payload.contextId) : null
    const result = userDb.prepare(`
      INSERT INTO assistant_conversations (
        user_id,
        context_type,
        context_id,
        context_label,
        context_snapshot_json,
        template_key,
        visibility,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(
      Number(payload.userId),
      contextType,
      contextId,
      payload.contextLabel || null,
      payload.contextSnapshot ? JSON.stringify(payload.contextSnapshot) : null,
      payload.templateKey || 'general_qa',
      visibility
    )

    return this.findById(result.lastInsertRowid)
  }

  static listOwned({ userId, limit = 50, offset = 0 } = {}) {
    const hasUserQuestionClause = this.hasUserQuestionClause('c')
    const where = `WHERE ${hasUserQuestionClause} AND c.user_id = ?`
    const params = [Number(userId)]

    const rows = userDb.prepare(`
      SELECT
        c.*,
        u.username AS owner_username,
        lm.content AS last_message_excerpt,
        lm.created_at AS last_message_at
      FROM assistant_conversations c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN assistant_messages lm ON lm.id = (
        SELECT id
        FROM assistant_messages
        WHERE conversation_id = c.id
        ORDER BY id DESC
        LIMIT 1
      )
      ${where}
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), Number(offset)).map(mapConversation)

    const total = userDb.prepare(`
      SELECT COUNT(*) AS total
      FROM assistant_conversations c
      ${where}
    `).get(...params).total

    return { rows, total }
  }

  static listSharedByContext({ userId, contextType, contextId, limit = 50, offset = 0 } = {}) {
    const normalizedContextType = normalizeContextType(contextType)
    const normalizedContextId = contextId ? Number(contextId) : 0

    if (normalizedContextType === 'none' || normalizedContextId <= 0) {
      return { rows: [], total: 0 }
    }

    const hasUserQuestionClause = this.hasUserQuestionClause('c')
    const where = `
      WHERE ${hasUserQuestionClause}
        AND c.visibility = ?
        AND c.context_type = ?
        AND c.context_id = ?
        AND c.user_id != ?
    `
    const params = ['context_shared', normalizedContextType, normalizedContextId, Number(userId)]

    const rows = userDb.prepare(`
      SELECT
        c.*,
        u.username AS owner_username,
        lm.content AS last_message_excerpt,
        lm.created_at AS last_message_at
      FROM assistant_conversations c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN assistant_messages lm ON lm.id = (
        SELECT id
        FROM assistant_messages
        WHERE conversation_id = c.id
        ORDER BY id DESC
        LIMIT 1
      )
      ${where}
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), Number(offset)).map(mapConversation)

    const total = userDb.prepare(`
      SELECT COUNT(*) AS total
      FROM assistant_conversations c
      ${where}
    `).get(...params).total

    return { rows, total }
  }

  static deleteOwned(id, userId) {
    const result = userDb.prepare(`
      DELETE FROM assistant_conversations
      WHERE id = ? AND user_id = ?
    `).run(Number(id), Number(userId))
    return result.changes > 0
  }

  static updateContextLabel(id, label) {
    userDb.prepare(`
      UPDATE assistant_conversations
      SET context_label = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(String(label || '').trim() || null, Number(id))
    return this.findById(id)
  }

  static updateOwnedContextLabel(id, userId, label) {
    userDb.prepare(`
      UPDATE assistant_conversations
      SET context_label = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ? AND user_id = ?
    `).run(String(label || '').trim() || null, Number(id), Number(userId))
    return this.findOwnedById(id, userId)
  }

  static findById(id) {
    return mapConversation(userDb.prepare(`
      SELECT
        c.*,
        u.username AS owner_username
      FROM assistant_conversations c
      JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
    `).get(Number(id)))
  }

  static findVisibleById(id, userId) {
    return mapConversation(userDb.prepare(`
      SELECT
        c.*,
        u.username AS owner_username
      FROM assistant_conversations c
      JOIN users u ON u.id = c.user_id
      WHERE c.id = ?
        AND (c.user_id = ? OR c.visibility = 'context_shared')
    `).get(Number(id), Number(userId)))
  }

  static findOwnedById(id, userId) {
    return mapConversation(userDb.prepare(`
      SELECT
        c.*,
        u.username AS owner_username
      FROM assistant_conversations c
      JOIN users u ON u.id = c.user_id
      WHERE c.id = ? AND c.user_id = ?
    `).get(Number(id), Number(userId)))
  }

  static messages(conversationId) {
    return userDb.prepare(`
      SELECT *
      FROM assistant_messages
      WHERE conversation_id = ?
      ORDER BY id ASC
    `).all(Number(conversationId)).map(mapMessage)
  }

  static addMessage({ conversationId, role, content, usedWebSearch = false, citations = [] }) {
    const result = userDb.prepare(`
      INSERT INTO assistant_messages (
        conversation_id,
        role,
        content,
        used_web_search,
        citations_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(
      Number(conversationId),
      normalizeRole(role),
      String(content || ''),
      usedWebSearch ? 1 : 0,
      citations?.length ? JSON.stringify(citations) : null
    )

    userDb.prepare(`
      UPDATE assistant_conversations
      SET updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(Number(conversationId))

    return mapMessage(userDb.prepare('SELECT * FROM assistant_messages WHERE id = ?').get(result.lastInsertRowid))
  }
}

module.exports = {
  AssistantConversation,
  CONTEXT_TYPES,
  VISIBILITIES
}
