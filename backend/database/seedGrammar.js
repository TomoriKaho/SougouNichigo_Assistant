const fs = require('fs')
const path = require('path')

const DEFAULT_TEXTBOOK_NAME = '综合日语 第四册'
const GRAMMAR_JSON = path.resolve(__dirname, '..', '..', 'data', 'grammar_4.json')

function normalizeText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

function normalizeTextbookName(value) {
  const text = normalizeText(value)
  if (!text) return DEFAULT_TEXTBOOK_NAME
  if (text === '综合日语第四册') return DEFAULT_TEXTBOOK_NAME
  return text
}

function ensureTextbook(db, name) {
  const existing = db.prepare('SELECT id FROM textbooks WHERE name = ?').get(name)
  if (existing) return existing.id

  return db.prepare(`
    INSERT INTO textbooks (name, order_index, created_at, updated_at)
    VALUES (?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(name).lastInsertRowid
}

function ensureLesson(db, textbookId, lessonNumber, title) {
  const existing = db
    .prepare('SELECT id FROM lessons WHERE textbook_id = ? AND lesson_number = ?')
    .get(textbookId, lessonNumber)
  if (existing) return existing.id

  return db.prepare(`
    INSERT INTO lessons (textbook_id, lesson_number, title, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(textbookId, lessonNumber, title).lastInsertRowid
}

function ensureUnit(db, lessonId, unitNumber, name) {
  const existing = db
    .prepare('SELECT id FROM units WHERE lesson_id = ? AND unit_number = ?')
    .get(lessonId, unitNumber)
  if (existing) return existing.id

  return db.prepare(`
    INSERT INTO units (lesson_id, unit_number, name, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(lessonId, unitNumber, name).lastInsertRowid
}

function parseUnitNumber(value) {
  const match = String(value || '').match(/\d+/)
  return match ? Number(match[0]) : 0
}

function seedGrammarFromJson(db) {
  if (!fs.existsSync(GRAMMAR_JSON)) {
    console.log(`   ⚠ 未找到 ${GRAMMAR_JSON}，跳过文法初始化`)
    return { imported: 0, skipped: true }
  }

  const raw = JSON.parse(fs.readFileSync(GRAMMAR_JSON, 'utf8'))
  const units = Array.isArray(raw?.['课文语法']) ? raw['课文语法'] : []
  if (!units.length) {
    throw new Error('grammar_4.json 必须包含非空的「课文语法」数组')
  }

  const insertEntry = db.prepare(`
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
  `)

  let imported = 0
  const run = db.transaction(() => {
    const textbookName = normalizeTextbookName(raw['教材名'])
    const textbookId = ensureTextbook(db, textbookName)

    units.forEach((unit) => {
      const lessonNumber = Number(unit['课程序号'] || 0) || 0
      const lessonId = ensureLesson(db, textbookId, lessonNumber, `第${lessonNumber}课`)
      const unitLabel = normalizeText(unit['单元序号']) || 'U0'
      const unitId = ensureUnit(db, lessonId, parseUnitNumber(unitLabel), unitLabel)
      const grammarItems = Array.isArray(unit['语法点']) ? unit['语法点'] : []

      grammarItems.forEach((item) => {
        const grammar = normalizeText(item['语法'])
        if (!grammar) return

        imported += 1
        insertEntry.run(
          textbookId,
          lessonId,
          unitId,
          grammar,
          normalizeText(item['简要逻辑']),
          normalizeText(item['意义']),
          normalizeText(item['译文']),
          normalizeText(item['接续']),
          normalizeText(item['说明']),
          JSON.stringify(Array.isArray(item['例句']) ? item['例句'] : []),
          imported
        )
      })
    })
  })

  run()
  console.log(`   ✓ 已从 grammar_4.json 导入 ${imported} 个文法条目`)
  return { imported, skipped: false }
}

module.exports = {
  DEFAULT_TEXTBOOK_NAME,
  seedGrammarFromJson
}
