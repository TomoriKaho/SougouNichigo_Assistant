const fs = require('fs')
const path = require('path')
const { deriveVocabularyFlags } = require('../lib/vocabularyFlags')
const { normalizeVocabularyWordFields } = require('../lib/vocabularyTermNormalizer')

const DEFAULT_TEXTBOOK_NAME = '综合日语 第四册'
const VOCABULARY_SOURCES = [
  {
    fileName: 'vocabulary_4.json',
    textbookName: DEFAULT_TEXTBOOK_NAME,
    orderIndex: 1
  },
  {
    fileName: 'vocabulary_2.json',
    textbookName: '综合日语 第二册',
    orderIndex: 2,
    swapKanaTermWithKanjiSupplement: true
  },
  {
    fileName: '综合日语一单词_第2-12课.json',
    textbookName: '综合日语 第一册',
    orderIndex: 3
  },
  {
    fileName: '综合日语三单词_第1-10课.json',
    textbookName: '综合日语 第三册',
    orderIndex: 4
  }
]

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

function ensureTextbook(db, name, orderIndex = 1) {
  const existing = db.prepare('SELECT id FROM textbooks WHERE name = ?').get(name)
  if (existing) return existing.id

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

function seedVocabularySource(db, source) {
  const sourcePath = path.resolve(__dirname, '..', '..', 'data', source.fileName)
  if (!fs.existsSync(sourcePath)) {
    console.log(`   ⚠ 未找到 ${sourcePath}，跳过词库初始化`)
    return { imported: 0, skipped: true }
  }

  const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
  if (!Array.isArray(raw)) {
    throw new Error(`${source.fileName} 顶层必须是数组`)
  }

  const textbookId = ensureTextbook(db, source.textbookName, source.orderIndex)
  const existingCount = db
    .prepare('SELECT COUNT(*) AS total FROM vocabulary_entries WHERE textbook_id = ?')
    .get(textbookId).total
  if (existingCount > 0) {
    console.log(`   • ${source.textbookName} 词库已存在 ${existingCount} 条，跳过 ${source.fileName}`)
    return { imported: 0, skipped: true }
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
      is_key_word,
      order_index,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `)

  let imported = 0
  const run = db.transaction(() => {
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
            const normalizedWord = normalizeVocabularyWordFields(word, {
              swapKanaTermWithKanjiSupplement: !!source.swapKanaTermWithKanjiSupplement
            })
            const term = normalizedWord.term
            if (!term) return
            const supplement = normalizedWord.supplement
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
              1,
              imported
            )
          })
        })
      })
    })
  })

  run()
  console.log(`   ✓ 已从 ${source.fileName} 导入 ${imported} 个词条`)
  return { imported, skipped: false }
}

function seedVocabularyFromJson(db) {
  return VOCABULARY_SOURCES.reduce(
    (summary, source) => {
      const result = seedVocabularySource(db, source)
      summary.imported += result.imported
      summary.skipped = summary.skipped && result.skipped
      return summary
    },
    { imported: 0, skipped: true }
  )
}

module.exports = {
  DEFAULT_TEXTBOOK_NAME,
  VOCABULARY_SOURCES,
  seedVocabularyFromJson
}
