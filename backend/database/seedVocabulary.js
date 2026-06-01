const fs = require('fs')
const path = require('path')
const { deriveVocabularyFlags } = require('../lib/vocabularyFlags')

const DEFAULT_TEXTBOOK_NAME = '综合日语 第四册'
const VOCABULARY_JSON = path.resolve(__dirname, '..', '..', 'data', 'Vocabulary_4.json')

function normalizeText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

function normalizeTableType(label) {
  const value = String(label || '').trim()
  if (value.includes('練習') || value.includes('练习')) return 'practice'
  return 'new'
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

function seedVocabularyFromJson(db) {
  if (!fs.existsSync(VOCABULARY_JSON)) {
    console.log(`   ⚠ 未找到 ${VOCABULARY_JSON}，跳过词库初始化`)
    return { imported: 0, skipped: true }
  }

  const raw = JSON.parse(fs.readFileSync(VOCABULARY_JSON, 'utf8'))
  if (!Array.isArray(raw)) {
    throw new Error('Vocabulary_4.json 顶层必须是数组')
  }

  const insertEntry = db.prepare(`
    INSERT INTO vocabulary_entries (
      textbook_id,
      lesson_id,
      unit_id,
      table_type,
      source_table_label,
      term,
      supplement,
      accent,
      part_of_speech,
      explanation,
      is_proper_noun,
      is_onomatopoeia,
      is_loanword,
      has_kanji,
      order_index,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `)

  let imported = 0
  const run = db.transaction(() => {
    const textbookId = ensureTextbook(db, DEFAULT_TEXTBOOK_NAME)

    raw.forEach((lesson) => {
      const lessonNumber = Number(lesson['课序'] || 0) || 0
      const lessonTitle = normalizeText(lesson['课名']) || `第${lessonNumber}课`
      const lessonId = ensureLesson(db, textbookId, lessonNumber, lessonTitle)

      const units = Array.isArray(lesson['单元']) ? lesson['单元'] : []
      units.forEach((unit) => {
        const unitNumber = Number(unit['单元序'] || 0) || 0
        const unitName = normalizeText(unit['单元名']) || `ユニット${unitNumber}`
        const unitId = ensureUnit(db, lessonId, unitNumber, unitName)

        const tables = Array.isArray(unit['词表']) ? unit['词表'] : []
        tables.forEach((table) => {
          const sourceLabel = normalizeText(table['词表类型']) || '新出単語'
          const tableType = normalizeTableType(sourceLabel)
          const words = Array.isArray(table['词条列表']) ? table['词条列表'] : []

          words.forEach((word) => {
            const term = normalizeText(word['词条'])
            if (!term) return
            const supplement = normalizeText(word['词条补充'])
            const accent = normalizeText(word['声调'])
            const partOfSpeech = normalizeText(word['词性'])
            const explanation = normalizeText(word['词语解释'] || word['解释'])
            const flags = deriveVocabularyFlags({
              term,
              supplement,
              partOfSpeech,
              explanation
            })

            imported += 1
            insertEntry.run(
              textbookId,
              lessonId,
              unitId,
              tableType,
              sourceLabel,
              term,
              supplement,
              accent,
              partOfSpeech,
              explanation,
              flags.properNoun ? 1 : 0,
              flags.onomatopoeia ? 1 : 0,
              flags.loanword ? 1 : 0,
              flags.kanjiWord ? 1 : 0,
              imported
            )
          })
        })
      })
    })
  })

  run()
  console.log(`   ✓ 已从 Vocabulary_4.json 导入 ${imported} 个词条`)
  return { imported, skipped: false }
}

module.exports = {
  DEFAULT_TEXTBOOK_NAME,
  seedVocabularyFromJson
}
