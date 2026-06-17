const fs = require('fs')
const path = require('path')
const Database = require('../backend/node_modules/better-sqlite3')
const { deriveVocabularyFlags } = require('../backend/lib/vocabularyFlags')
const { normalizeVocabularyWordFields } = require('../backend/lib/vocabularyTermNormalizer')

const dataPath = path.resolve(__dirname, '..', 'data', 'vocabulary_2.json')
const dbPath = path.resolve(__dirname, '..', 'data', 'vocabulary.db')
const textbookName = '综合日语 第二册'

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

function collectAndFixJson(data) {
  const changes = []

  data.forEach((lesson) => {
    const lessonNumber = Number(lesson['课序'] || 0) || 0
    const lessonTitle = normalizeText(lesson['课名']) || `第${lessonNumber}课`
    const units = Array.isArray(lesson['单元']) ? lesson['单元'] : []

    units.forEach((unit) => {
      const unitNumber = Number(unit['单元序'] || 0) || 0
      const tables = Array.isArray(unit['词表']) ? unit['词表'] : []

      tables.forEach((table) => {
        const sourceTableLabel = normalizeText(table['词表类型']) || '新出単語'
        const tableType = normalizeTableType(sourceTableLabel)
        const words = Array.isArray(table['词条列表']) ? table['词条列表'] : []

        words.forEach((word) => {
          const oldTerm = normalizeText(word['词条'])
          const oldSupplement = normalizeText(word['词条补充'])
          const normalizedWord = normalizeVocabularyWordFields(word, {
            swapKanaTermWithKanjiSupplement: true
          })
          if (!normalizedWord.swapped) return

          word['词条'] = normalizedWord.term
          word['词条补充'] = normalizedWord.supplement

          changes.push({
            lessonNumber,
            lessonTitle,
            unitNumber,
            sourceTableLabel,
            tableType,
            oldTerm,
            oldSupplement,
            newTerm: normalizedWord.term,
            newSupplement: normalizedWord.supplement,
            partOfSpeech: normalizeText(word['词性']),
            explanation: normalizeText(word['词语解释'] || word['解释'])
          })
        })
      })
    })
  })

  return changes
}

function updateDatabase(changes) {
  if (!changes.length) return { updated: 0, missing: [] }
  const db = new Database(dbPath)

  const findEntry = db.prepare(`
    SELECT v.id
    FROM vocabulary_entries v
    JOIN textbooks t ON t.id = v.textbook_id
    JOIN lessons l ON l.id = v.lesson_id
    JOIN units u ON u.id = v.unit_id
    WHERE t.name = ?
      AND l.lesson_number = ?
      AND u.unit_number = ?
      AND v.table_type = ?
      AND COALESCE(v.source_table_label, '') = ?
      AND v.term = ?
      AND COALESCE(v.supplement, '') = ?
      AND COALESCE(v.explanation, '') = ?
    ORDER BY v.id
  `)

  const findUpdatedEntry = db.prepare(`
    SELECT v.id
    FROM vocabulary_entries v
    JOIN textbooks t ON t.id = v.textbook_id
    JOIN lessons l ON l.id = v.lesson_id
    JOIN units u ON u.id = v.unit_id
    WHERE t.name = ?
      AND l.lesson_number = ?
      AND u.unit_number = ?
      AND v.table_type = ?
      AND COALESCE(v.source_table_label, '') = ?
      AND v.term = ?
      AND COALESCE(v.supplement, '') = ?
      AND COALESCE(v.explanation, '') = ?
    ORDER BY v.id
  `)

  const updateEntry = db.prepare(`
    UPDATE vocabulary_entries
    SET
      term = ?,
      supplement = ?,
      is_proper_noun = ?,
      is_onomatopoeia = ?,
      is_loanword = ?,
      has_kanji = ?,
      updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `)

  let updated = 0
  const missing = []

  db.transaction(() => {
    changes.forEach((change) => {
      const params = [
        textbookName,
        change.lessonNumber,
        change.unitNumber,
        change.tableType,
        change.sourceTableLabel,
        change.oldTerm,
        change.oldSupplement || '',
        change.explanation || ''
      ]
      const rows = findEntry.all(...params)

      if (!rows.length) {
        const updatedRows = findUpdatedEntry.all(
          textbookName,
          change.lessonNumber,
          change.unitNumber,
          change.tableType,
          change.sourceTableLabel,
          change.newTerm,
          change.newSupplement || '',
          change.explanation || ''
        )
        if (!updatedRows.length) missing.push(change)
        return
      }

      rows.forEach((row) => {
        const flags = deriveVocabularyFlags({
          term: change.newTerm,
          supplement: change.newSupplement,
          partOfSpeech: change.partOfSpeech,
          explanation: change.explanation
        })

        updateEntry.run(
          change.newTerm,
          change.newSupplement,
          flags.properNoun ? 1 : 0,
          flags.onomatopoeia ? 1 : 0,
          flags.loanword ? 1 : 0,
          flags.kanjiWord ? 1 : 0,
          row.id
        )
        updated += 1
      })
    })
  })()

  db.close()
  return { updated, missing }
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
if (!Array.isArray(data)) throw new Error('vocabulary_2.json 顶层必须是数组')

const changes = collectAndFixJson(data)
if (changes.length) {
  fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`)
}

const dbResult = updateDatabase(changes)

console.log(JSON.stringify({
  jsonChanged: changes.length,
  dbUpdated: dbResult.updated,
  dbMissing: dbResult.missing.length,
  changes: changes.map((change) => ({
    lesson: change.lessonNumber,
    unit: change.unitNumber,
    table: change.sourceTableLabel,
    from: `${change.oldTerm} / ${change.oldSupplement}`,
    to: `${change.newTerm} / ${change.newSupplement}`
  })),
  missing: dbResult.missing.map((change) => ({
    lesson: change.lessonNumber,
    unit: change.unitNumber,
    table: change.sourceTableLabel,
    from: `${change.oldTerm} / ${change.oldSupplement}`,
    to: `${change.newTerm} / ${change.newSupplement}`
  }))
}, null, 2))
