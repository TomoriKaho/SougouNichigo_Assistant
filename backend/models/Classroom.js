const crypto = require('crypto')
const { userDb, readingMaterialsDb } = require('../database/db')

const CLASS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CLASS_CODE_LENGTH = 8

function normalizeText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase()
}

function generateClassCode() {
  const bytes = crypto.randomBytes(CLASS_CODE_LENGTH)
  let code = ''
  for (let index = 0; index < CLASS_CODE_LENGTH; index += 1) {
    code += CLASS_CODE_ALPHABET[bytes[index] % CLASS_CODE_ALPHABET.length]
  }
  return code
}

function issueUniqueClassCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateClassCode()
    const exists = userDb.prepare('SELECT id FROM classes WHERE code = ?').get(code)
    if (!exists) return code
  }
  throw new Error('无法生成唯一班级码')
}

function mapClassRow(row) {
  if (!row) return null
  return {
    ...row,
    member_count: Number(row.member_count || 0),
    student_count: Number(row.student_count || 0),
    teacher_member_count: Number(row.teacher_member_count || 0),
    material_count: Number(row.material_count || 0),
    is_creator: !!row.is_creator
  }
}

function materialCountMap(classIds = []) {
  const normalizedIds = Array.from(new Set(classIds.map((value) => Number(value)).filter(Boolean)))
  if (!normalizedIds.length) return new Map()
  const placeholders = normalizedIds.map(() => '?').join(', ')
  const rows = readingMaterialsDb.prepare(`
    SELECT class_id, COUNT(*) AS total
    FROM reading_materials
    WHERE class_id IN (${placeholders})
    GROUP BY class_id
  `).all(...normalizedIds)
  return new Map(rows.map((row) => [Number(row.class_id), Number(row.total || 0)]))
}

function withMaterialCount(row, countMap) {
  if (!row) return null
  return {
    ...row,
    material_count: Number(countMap.get(Number(row.id)) || 0)
  }
}

function membershipRoleForUserType(userType) {
  return String(userType || '').trim().toLowerCase() === 'teacher' ? 'teacher' : 'student'
}

function classRowById(classId) {
  return userDb.prepare('SELECT * FROM classes WHERE id = ?').get(Number(classId))
}

class Classroom {
  static create({ teacherUserId, name }) {
    const normalizedName = normalizeText(name)
    if (!normalizedName) throw new Error('班级名不能为空')

    const teacherId = Number(teacherUserId)
    const code = issueUniqueClassCode()
    const result = userDb.prepare(`
      INSERT INTO classes (
        name,
        code,
        teacher_user_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(
      normalizedName,
      code,
      teacherId
    )

    userDb.prepare(`
      INSERT OR IGNORE INTO class_memberships (
        class_id,
        user_id,
        member_role,
        created_at
      )
      VALUES (?, ?, 'teacher', datetime('now', 'localtime'))
    `).run(result.lastInsertRowid, teacherId)

    return this.findForUser(result.lastInsertRowid, { userId: teacherId })
  }

  static joinByCode({ userId, userType, code }) {
    const normalizedCode = normalizeCode(code)
    if (!normalizedCode) throw new Error('班级码不能为空')

    const classroom = userDb.prepare(`
      SELECT id, teacher_user_id
      FROM classes
      WHERE code = ?
    `).get(normalizedCode)

    if (!classroom) {
      const error = new Error('班级码不存在')
      error.code = 'CLASS_NOT_FOUND'
      throw error
    }

    if (Number(classroom.teacher_user_id) === Number(userId)) {
      const error = new Error('不能加入自己创建的班级')
      error.code = 'CLASS_SELF_JOIN'
      throw error
    }

    try {
      userDb.prepare(`
        INSERT INTO class_memberships (
          class_id,
          user_id,
          member_role,
          created_at
        )
        VALUES (?, ?, ?, datetime('now', 'localtime'))
      `).run(
        classroom.id,
        Number(userId),
        membershipRoleForUserType(userType)
      )
    } catch (error) {
      if (String(error?.message || '').includes('UNIQUE constraint failed')) {
        const duplicate = new Error('您已加入该班级')
        duplicate.code = 'CLASS_ALREADY_JOINED'
        throw duplicate
      }
      throw error
    }

    return this.findForUser(classroom.id, { userId })
  }

  static listForUser({ userId, limit = 50, offset = 0 } = {}) {
    const numericUserId = Number(userId)
    const numericLimit = Number(limit || 50)
    const numericOffset = Number(offset || 0)

    const rows = userDb.prepare(`
      SELECT
        c.id,
        c.name,
        c.code,
        c.teacher_user_id,
        c.created_at,
        c.updated_at,
        m.created_at AS joined_at,
        m.member_role,
        u.username AS teacher_username,
        CASE WHEN c.teacher_user_id = ? THEN 1 ELSE 0 END AS is_creator,
        (
          SELECT COUNT(*)
          FROM class_memberships cm
          WHERE cm.class_id = c.id
        ) AS member_count,
        (
          SELECT COUNT(*)
          FROM class_memberships cm
          WHERE cm.class_id = c.id AND cm.member_role = 'student'
        ) AS student_count,
        (
          SELECT COUNT(*)
          FROM class_memberships cm
          WHERE cm.class_id = c.id AND cm.member_role = 'teacher'
        ) AS teacher_member_count
      FROM class_memberships m
      JOIN classes c ON c.id = m.class_id
      JOIN users u ON u.id = c.teacher_user_id
      WHERE m.user_id = ?
      ORDER BY datetime(m.created_at) DESC, m.id DESC
      LIMIT ? OFFSET ?
    `).all(numericUserId, numericUserId, numericLimit, numericOffset).map(mapClassRow)

    const countMap = materialCountMap(rows.map((row) => row.id))

    const total = userDb.prepare(`
      SELECT COUNT(*) AS total
      FROM class_memberships
      WHERE user_id = ?
    `).get(numericUserId).total

    return { rows: rows.map((row) => withMaterialCount(row, countMap)), total }
  }

  static membershipForUser(classId, userId) {
    return userDb.prepare(`
      SELECT *
      FROM class_memberships
      WHERE class_id = ? AND user_id = ?
    `).get(Number(classId), Number(userId))
  }

  static canAccess(classId, { userId }) {
    return !!this.membershipForUser(classId, userId)
  }

  static canManageMaterials(classId, { userId }) {
    const membership = this.membershipForUser(classId, userId)
    return membership?.member_role === 'teacher'
  }

  static canRenameOrManageStudents(classId, { userId }) {
    const row = classRowById(classId)
    return !!row && Number(row.teacher_user_id) === Number(userId)
  }

  static findForUser(classId, { userId }) {
    if (!this.canAccess(classId, { userId })) return null

    const row = userDb.prepare(`
      SELECT
        c.id,
        c.name,
        c.code,
        c.teacher_user_id,
        c.created_at,
        c.updated_at,
        m.created_at AS joined_at,
        m.member_role,
        u.username AS teacher_username,
        CASE WHEN c.teacher_user_id = ? THEN 1 ELSE 0 END AS is_creator,
        (
          SELECT COUNT(*)
          FROM class_memberships cm
          WHERE cm.class_id = c.id
        ) AS member_count,
        (
          SELECT COUNT(*)
          FROM class_memberships cm
          WHERE cm.class_id = c.id AND cm.member_role = 'student'
        ) AS student_count,
        (
          SELECT COUNT(*)
          FROM class_memberships cm
          WHERE cm.class_id = c.id AND cm.member_role = 'teacher'
        ) AS teacher_member_count
      FROM classes c
      JOIN class_memberships m ON m.class_id = c.id AND m.user_id = ?
      JOIN users u ON u.id = c.teacher_user_id
      WHERE c.id = ?
    `).get(Number(userId), Number(userId), Number(classId))

    if (!row) return null

    const members = userDb.prepare(`
      SELECT
        cm.id,
        cm.user_id,
        cm.member_role,
        cm.created_at AS joined_at,
        u.username,
        u.email,
        u.user_type
      FROM class_memberships cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.class_id = ?
      ORDER BY
        CASE WHEN cm.member_role = 'teacher' THEN 0 ELSE 1 END ASC,
        datetime(cm.created_at) ASC,
        cm.id ASC
    `).all(Number(classId))

    const countMap = materialCountMap([row.id])

    return {
      ...withMaterialCount(mapClassRow(row), countMap),
      members
    }
  }

  static updateName({ classId, teacherUserId, name }) {
    const normalizedName = normalizeText(name)
    if (!normalizedName) throw new Error('班级名不能为空')
    return userDb.prepare(`
      UPDATE classes
      SET
        name = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ? AND teacher_user_id = ?
    `).run(
      normalizedName,
      Number(classId),
      Number(teacherUserId)
    )
  }

  static removeStudent({ classId, teacherUserId, studentUserId }) {
    const classroom = classRowById(classId)
    if (!classroom || Number(classroom.teacher_user_id) !== Number(teacherUserId)) {
      return { changes: 0, reason: 'forbidden' }
    }

    const membership = this.membershipForUser(classId, studentUserId)
    if (!membership) return { changes: 0, reason: 'missing' }
    if (membership.member_role !== 'student') return { changes: 0, reason: 'not-student' }

    return userDb.prepare(`
      DELETE FROM class_memberships
      WHERE class_id = ? AND user_id = ? AND member_role = 'student'
    `).run(
      Number(classId),
      Number(studentUserId)
    )
  }

  static dissolve({ classId, teacherUserId }) {
    return userDb.prepare('DELETE FROM classes WHERE id = ? AND teacher_user_id = ?').run(
      Number(classId),
      Number(teacherUserId)
    )
  }
}

module.exports = {
  Classroom,
  normalizeCode
}
