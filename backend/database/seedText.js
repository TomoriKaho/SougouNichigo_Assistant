const fs = require('fs')
const path = require('path')

const DEFAULT_TEXTBOOK_NAME = '综合日语 第四册'
const TEXT_JSON = path.resolve(__dirname, '..', '..', 'data', 'text_4.json')

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

function seedTextFromJson(db) {
  if (!fs.existsSync(TEXT_JSON)) {
    console.log(`   ⚠ 未找到 ${TEXT_JSON}，跳过课文初始化`)
    return { imported: 0, skipped: true }
  }

  const raw = JSON.parse(fs.readFileSync(TEXT_JSON, 'utf8'))
  const entries = Array.isArray(raw?.['课文']) ? raw['课文'] : []
  if (!entries.length) {
    throw new Error('text_4.json 必须包含非空的「课文」数组')
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
    const textbookId = ensureTextbook(db, normalizeTextbookName(raw['教材名']))
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
  console.log(`   ✓ 已从 text_4.json 导入 ${imported} 个课文条目`)
  return { imported, skipped: false }
}

module.exports = {
  DEFAULT_TEXTBOOK_NAME,
  seedTextFromJson
}
