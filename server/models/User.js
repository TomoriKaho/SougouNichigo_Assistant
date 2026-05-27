const bcrypt = require('bcryptjs')
const { userDb } = require('../database/db')

const ALLOWED_ROLES = ['dev', 'admin', 'user']
const ALLOWED_USER_TYPES = ['student', 'teacher']

function normalizeEmail(email) {
  const value = String(email || '').trim().toLowerCase()
  return value ? value : null
}

function publicUser(row) {
  if (!row) return null
  const { password, ...rest } = row
  return {
    ...rest,
    is_initial_admin: !!row.is_initial_admin,
    is_initial_dev: !!row.is_initial_dev
  }
}

class User {
  static create(payload) {
    const username = String(payload.username || '').trim()
    const password = String(payload.password || '')
    const role = ALLOWED_ROLES.includes(payload.role) ? payload.role : 'user'
    const userType = ALLOWED_USER_TYPES.includes(payload.user_type) ? payload.user_type : 'student'

    if (!username) throw new Error('用户名不能为空')
    if (!password) throw new Error('密码不能为空')

    const result = userDb.prepare(`
      INSERT INTO users (
        username,
        password,
        email,
        user_type,
        role,
        is_initial_admin,
        is_initial_dev,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(
      username,
      bcrypt.hashSync(password, 10),
      normalizeEmail(payload.email),
      userType,
      role,
      payload.is_initial_admin ? 1 : 0,
      payload.is_initial_dev ? 1 : 0
    )

    return result.lastInsertRowid
  }

  static findRawById(id) {
    return userDb.prepare('SELECT * FROM users WHERE id = ?').get(id)
  }

  static findById(id) {
    return publicUser(this.findRawById(id))
  }

  static findRawByIdentifier(identifier) {
    const value = String(identifier || '').trim()
    if (!value) return null
    return userDb.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(value, value.toLowerCase())
  }

  static findRawByUsername(username) {
    return userDb.prepare('SELECT * FROM users WHERE username = ?').get(username)
  }

  static findRawInitialDev() {
    return userDb.prepare('SELECT * FROM users WHERE is_initial_dev = 1 ORDER BY id LIMIT 1').get()
  }

  static findRawInitialAdmin() {
    return userDb.prepare('SELECT * FROM users WHERE is_initial_admin = 1 ORDER BY id LIMIT 1').get()
  }

  static findRawByEmail(email) {
    const value = normalizeEmail(email)
    if (!value) return null
    return userDb.prepare('SELECT * FROM users WHERE email = ?').get(value)
  }

  static verifyPassword(password, hashed) {
    return bcrypt.compareSync(String(password || ''), hashed || '')
  }

  static list({ limit = 50, offset = 0, role = 'all', keyword = '', excludeRoles = [] } = {}) {
    const clauses = []
    const params = []

    if (role && role !== 'all') {
      clauses.push('role = ?')
      params.push(role)
    }

    if (Array.isArray(excludeRoles) && excludeRoles.length) {
      clauses.push(`role NOT IN (${excludeRoles.map(() => '?').join(', ')})`)
      params.push(...excludeRoles)
    }

    const term = String(keyword || '').trim().toLowerCase()
    if (term) {
      clauses.push("(CAST(id AS TEXT) LIKE ? OR lower(username) LIKE ? OR lower(COALESCE(email, '')) LIKE ?)")
      params.push(`%${term}%`, `%${term}%`, `%${term}%`)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = userDb.prepare(`
      SELECT id, username, email, user_type, role, is_initial_admin, is_initial_dev, created_at, updated_at
      FROM users
      ${where}
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(publicUser)

    const total = userDb.prepare(`SELECT COUNT(*) AS total FROM users ${where}`).get(...params).total
    return { rows, total }
  }

  static update(id, payload) {
    const updates = []
    const params = []

    if (payload.username !== undefined) {
      updates.push('username = ?')
      params.push(String(payload.username || '').trim())
    }

    if (payload.email !== undefined) {
      updates.push('email = ?')
      params.push(normalizeEmail(payload.email))
    }

    if (payload.password) {
      updates.push('password = ?')
      params.push(bcrypt.hashSync(String(payload.password), 10))
    }

    if (payload.user_type !== undefined) {
      updates.push('user_type = ?')
      params.push(payload.user_type)
    }

    if (payload.role !== undefined) {
      updates.push('role = ?')
      params.push(payload.role)
    }

    if (payload.is_initial_admin !== undefined) {
      updates.push('is_initial_admin = ?')
      params.push(payload.is_initial_admin ? 1 : 0)
    }

    if (payload.is_initial_dev !== undefined) {
      updates.push('is_initial_dev = ?')
      params.push(payload.is_initial_dev ? 1 : 0)
    }

    if (!updates.length) return { changes: 0 }

    updates.push("updated_at = datetime('now', 'localtime')")
    params.push(id)

    return userDb.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  }

  static delete(id) {
    return userDb.prepare('DELETE FROM users WHERE id = ?').run(id)
  }

  static clearInitialDevExcept(id) {
    return userDb.prepare('UPDATE users SET is_initial_dev = 0 WHERE id != ? AND is_initial_dev = 1').run(id)
  }

  static clearInitialAdminExcept(id) {
    return userDb.prepare('UPDATE users SET is_initial_admin = 0 WHERE id != ? AND is_initial_admin = 1').run(id)
  }

  static counts() {
    return {
      total: userDb.prepare('SELECT COUNT(*) AS total FROM users').get().total,
      admins: userDb.prepare("SELECT COUNT(*) AS total FROM users WHERE role IN ('dev', 'admin')").get().total,
      students: userDb.prepare("SELECT COUNT(*) AS total FROM users WHERE user_type = 'student'").get().total,
      teachers: userDb.prepare("SELECT COUNT(*) AS total FROM users WHERE user_type = 'teacher'").get().total
    }
  }
}

module.exports = {
  User,
  ALLOWED_ROLES,
  ALLOWED_USER_TYPES
}
