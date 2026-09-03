const fs = require('fs')
const path = require('path')

const DEFAULT_TEXTBOOK_NAME = '综合日语 第四册'
const TEXT_SOURCES = [
  {
    fileName: 'text_4.json',
    defaultTextbookName: DEFAULT_TEXTBOOK_NAME,
    orderIndex: 1
  },
  {
    fileName: 'text_2.json',
    defaultTextbookName: '综合日语 第二册',
    orderIndex: 2
  },
  {
    fileName: '综合日语第一册_课文识别整理.json',
    defaultTextbookName: '综合日语 第一册',
    orderIndex: 3
  },
  {
    fileName: '综合日语第三册_课文识别整理.json',
    defaultTextbookName: '综合日语 第三册',
    orderIndex: 4
  }
]

function normalizeText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

function normalizeTextbookName(value, fallback = DEFAULT_TEXTBOOK_NAME) {
  const text = normalizeText(value)
  if (!text) return fallback
  if (text === '综合日语第四册') return DEFAULT_TEXTBOOK_NAME
  if (text === '综合日语第二册') return '综合日语 第二册'
  if (text === '综合日语第一册') return '综合日语 第一册'
  if (text === '综合日语第三册') return '综合日语 第三册'
  return text
}

function ensureTextbook(db, name, orderIndex = 1) {
  const existing = db.prepare('SELECT id FROM textbooks WHERE name = ?').get(name)
  if (existing) return existing.id

  return db.prepare(`
    INSERT INTO textbooks (name, order_index, created_at, updated_at)
    VALUES (?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(name, orderIndex).lastInsertRowid
}

function seedTextSource(db, source) {
  const sourcePath = path.resolve(__dirname, '..', '..', 'data', source.fileName)
  if (!fs.existsSync(sourcePath)) {
    console.log(`   ⚠ 未找到 ${sourcePath}，跳过课文初始化`)
    return { imported: 0, skipped: true }
  }

  const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
  const entries = Array.isArray(raw?.['课文']) ? raw['课文'] : []
  if (!entries.length) {
    throw new Error(`${source.fileName} 必须包含非空的「课文」数组`)
  }

  const textbookName = normalizeTextbookName(raw['教材名'], source.defaultTextbookName)
  const textbookId = ensureTextbook(db, textbookName, source.orderIndex)
  const existingCount = db
    .prepare('SELECT COUNT(*) AS total FROM text_entries WHERE textbook_id = ?')
    .get(textbookId).total
  if (existingCount > 0) {
    console.log(`   • ${textbookName} 课文已存在 ${existingCount} 条，跳过 ${source.fileName}`)
    return { imported: 0, skipped: true }
  }

  const insertEntry = db.prepare(`
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
  `)

  let imported = 0
  const run = db.transaction(() => {
    entries.forEach((entry) => {
      const title = normalizeText(entry['标题'])
      const content = normalizeText(entry['全部文本'])
      if (!title && !content) return

      imported += 1
      insertEntry.run(
        textbookId,
        Number(entry['课程序号'] || 0) || 0,
        Number(entry['单元序号'] || 0) || 0,
        title || `课文${imported}`,
        content || '',
        imported
      )
    })
  })

  run()
  console.log(`   ✓ 已从 ${source.fileName} 导入 ${imported} 个课文条目`)
  return { imported, skipped: false }
}

function seedTextFromJson(db) {
  return TEXT_SOURCES.reduce(
    (summary, source) => {
      const result = seedTextSource(db, source)
      summary.imported += result.imported
      summary.skipped = summary.skipped && result.skipped
      return summary
    },
    { imported: 0, skipped: true }
  )
}

module.exports = {
  DEFAULT_TEXTBOOK_NAME,
  TEXT_SOURCES,
  seedTextFromJson
}
