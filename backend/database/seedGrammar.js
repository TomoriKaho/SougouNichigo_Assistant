const fs = require('fs')
const path = require('path')

const DEFAULT_TEXTBOOK_NAME = '综合日语 第四册'
const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', '..', 'data')

const GRAMMAR_SOURCES = [
  {
    key: 'first',
    textbookName: '综合日语 第一册',
    orderIndex: 1,
    fileName: '综合日语第一册_文法_JSON_Markdown.json'
  },
  {
    key: 'second',
    textbookName: '综合日语 第二册',
    orderIndex: 2,
    fileName: '综合日语第二册_文法_JSON_Markdown.json'
  },
  {
    key: 'third',
    textbookName: '综合日语 第三册',
    orderIndex: 3,
    fileName: '综合日语第三册_解说文法_第1课U1至第10课U2.json'
  },
  {
    key: 'fourth',
    textbookName: DEFAULT_TEXTBOOK_NAME,
    orderIndex: 4,
    fileName: 'grammar_4.json'
  }
]

function normalizeText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text || null
}

function normalizeTextbookName(value, fallback) {
  const text = normalizeText(value)
  if (!text) return fallback
  return text.replace(/^综合日语(?=第[一二三四五六七八九十]+册$)/, '综合日语 ')
}

function parseUnitNumber(value) {
  const match = String(value || '').match(/\d+/)
  return match ? Number(match[0]) : 0
}

function getGrammarSources(dataDir = DEFAULT_DATA_DIR) {
  return GRAMMAR_SOURCES.map((source) => ({
    ...source,
    filePath: path.join(dataDir, source.fileName)
  }))
}

function ensureTextbook(db, name, orderIndex) {
  const existing = db.prepare('SELECT id FROM textbooks WHERE name = ?').get(name)
  if (existing) {
    db.prepare(`
      UPDATE textbooks
      SET order_index = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(orderIndex, existing.id)
    return existing.id
  }

  return db.prepare(`
    INSERT INTO textbooks (name, order_index, created_at, updated_at)
    VALUES (?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(name, orderIndex).lastInsertRowid
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

function parseGrammarSource(source) {
  if (!fs.existsSync(source.filePath)) {
    throw new Error(`未找到文法数据文件：${source.filePath}`)
  }

  const raw = JSON.parse(fs.readFileSync(source.filePath, 'utf8'))
  const rows = []

  if (Array.isArray(raw?.['课文语法'])) {
    raw['课文语法'].forEach((unit) => {
      const lessonNumber = Number(unit['课程序号'] || 0)
      const unitLabel = normalizeText(unit['单元序号']) || 'U0'
      const grammarItems = Array.isArray(unit['语法点']) ? unit['语法点'] : []
      grammarItems.forEach((item) => rows.push({ lessonNumber, unitLabel, item }))
    })
  } else if (Array.isArray(raw?.['文法'])) {
    raw['文法'].forEach((item) => {
      const lessonNumber = Number(item['课程序号'] || 0)
      const unitNumber = Number(item['单元序号'] || 0)
      rows.push({ lessonNumber, unitLabel: `U${unitNumber || 0}`, item })
    })
  } else {
    throw new Error(`${source.fileName} 必须包含非空的「课文语法」或「文法」数组`)
  }

  if (!rows.length) {
    throw new Error(`${source.fileName} 不包含可导入的文法条目`)
  }

  rows.forEach(({ lessonNumber, unitLabel, item }, index) => {
    if (!lessonNumber || !parseUnitNumber(unitLabel) || !normalizeText(item?.['语法'])) {
      throw new Error(`${source.fileName} 第 ${index + 1} 条缺少课次、单元或语法`)
    }
  })

  return {
    textbookName: normalizeTextbookName(raw['教材名'], source.textbookName),
    rows
  }
}

function importGrammarSource(db, source, { replace = false } = {}) {
  const { textbookName, rows } = parseGrammarSource(source)
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
      content_markdown,
      order_index,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `)

  let deleted = 0
  let imported = 0
  db.transaction(() => {
    const textbookId = ensureTextbook(db, textbookName, source.orderIndex)
    if (replace) {
      deleted = db.prepare('DELETE FROM grammar_entries WHERE textbook_id = ?').run(textbookId).changes
      db.prepare('DELETE FROM units WHERE lesson_id IN (SELECT id FROM lessons WHERE textbook_id = ?)').run(textbookId)
      db.prepare('DELETE FROM lessons WHERE textbook_id = ?').run(textbookId)
    }

    rows.forEach(({ lessonNumber, unitLabel, item }) => {
      const lessonId = ensureLesson(db, textbookId, lessonNumber, `第${lessonNumber}课`)
      const unitId = ensureUnit(db, lessonId, parseUnitNumber(unitLabel), unitLabel)
      imported += 1
      insertEntry.run(
        textbookId,
        lessonId,
        unitId,
        normalizeText(item['语法']),
        normalizeText(item['简要逻辑'] || item['简要解释']),
        normalizeText(item['意义']),
        normalizeText(item['译文']),
        normalizeText(item['接续']),
        normalizeText(item['说明']),
        JSON.stringify(Array.isArray(item['例句']) ? item['例句'].map((example) => String(example).trim()).filter(Boolean) : []),
        normalizeText(item['内容Markdown']),
        imported
      )
    })
  })()

  return { textbookName, imported, deleted }
}

function seedGrammarFromJson(db) {
  const results = []
  getGrammarSources().forEach((source) => {
    if (!fs.existsSync(source.filePath)) {
      console.log(`   ⚠ 未找到 ${source.filePath}，跳过文法初始化`)
      return
    }
    const result = importGrammarSource(db, source)
    results.push(result)
    console.log(`   ✓ 已从 ${source.fileName} 导入 ${result.imported} 个文法条目`)
  })
  return results
}

module.exports = {
  DEFAULT_TEXTBOOK_NAME,
  GRAMMAR_SOURCES,
  getGrammarSources,
  parseGrammarSource,
  importGrammarSource,
  seedGrammarFromJson
}
