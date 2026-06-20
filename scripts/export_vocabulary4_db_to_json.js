const fs = require('fs')
const path = require('path')

const Database = require('../backend/node_modules/better-sqlite3')

const projectRoot = path.resolve(__dirname, '..')
const jsonPath = path.join(projectRoot, 'data', 'vocabulary_4.json')
const dbPath = path.join(projectRoot, 'data', 'vocabulary.db')
const textbookName = '综合日语 第四册'

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function toJsonBoolean(value) {
  return !!value
}

function assignExistingField(target, key, value) {
  if (hasOwn(target, key)) {
    target[key] = value
  }
}

function tableKey(lessonNumber, unitNumber, tableLabel) {
  return `${lessonNumber}\u0000${unitNumber}\u0000${tableLabel || ''}`
}

function main() {
  const vocabularyJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const db = new Database(dbPath, { readonly: true })

  const textbook = db.prepare('SELECT id FROM textbooks WHERE name = ?').get(textbookName)
  if (!textbook) {
    throw new Error(`Textbook not found: ${textbookName}`)
  }

  const lessonRows = db.prepare(`
    SELECT id, lesson_number, title
    FROM lessons
    WHERE textbook_id = ?
    ORDER BY lesson_number
  `).all(textbook.id)
  const lessonsByNumber = new Map(lessonRows.map((row) => [row.lesson_number, row]))

  const unitRows = db.prepare(`
    SELECT u.id, u.lesson_id, u.unit_number, u.name, l.lesson_number
    FROM units u
    JOIN lessons l ON l.id = u.lesson_id
    WHERE l.textbook_id = ?
    ORDER BY l.lesson_number, u.unit_number
  `).all(textbook.id)
  const unitsByLessonAndNumber = new Map(unitRows.map((row) => [`${row.lesson_number}\u0000${row.unit_number}`, row]))

  const entryRows = db.prepare(`
    SELECT
      v.*,
      l.lesson_number,
      u.unit_number
    FROM vocabulary_entries v
    JOIN lessons l ON l.id = v.lesson_id
    JOIN units u ON u.id = v.unit_id
    WHERE v.textbook_id = ?
    ORDER BY l.lesson_number, u.unit_number, v.source_table_label, v.order_index, v.id
  `).all(textbook.id)

  const entriesByTable = new Map()
  for (const row of entryRows) {
    const key = tableKey(row.lesson_number, row.unit_number, row.source_table_label)
    if (!entriesByTable.has(key)) {
      entriesByTable.set(key, [])
    }
    entriesByTable.get(key).push(row)
  }

  const warnings = []
  let lessonsUpdated = 0
  let unitsUpdated = 0
  let entriesUpdated = 0

  for (const lesson of vocabularyJson) {
    const lessonNumber = lesson['课序']
    const lessonRow = lessonsByNumber.get(lessonNumber)
    if (!lessonRow) {
      warnings.push(`Missing lesson ${lessonNumber}`)
      continue
    }
    assignExistingField(lesson, '课名', lessonRow.title)
    lessonsUpdated += 1

    for (const unit of lesson['单元'] || []) {
      const unitNumber = unit['单元序']
      const unitRow = unitsByLessonAndNumber.get(`${lessonNumber}\u0000${unitNumber}`)
      if (!unitRow) {
        warnings.push(`Missing unit lesson=${lessonNumber} unit=${unitNumber}`)
        continue
      }
      assignExistingField(unit, '单元名', unitRow.name)
      unitsUpdated += 1

      for (const table of unit['词表'] || []) {
        const tableLabel = table['词表类型']
        const rows = entriesByTable.get(tableKey(lessonNumber, unitNumber, tableLabel)) || []
        const entries = table['词条列表'] || []
        if (rows.length !== entries.length) {
          warnings.push(
            `Count mismatch lesson=${lessonNumber} unit=${unitNumber} table=${tableLabel}: json=${entries.length}, db=${rows.length}`
          )
        }

        const count = Math.min(rows.length, entries.length)
        for (let index = 0; index < count; index += 1) {
          const entry = entries[index]
          const row = rows[index]
          assignExistingField(entry, '词条', row.term)
          assignExistingField(entry, '词条补充', row.supplement)
          assignExistingField(entry, '声调', row.accent)
          assignExistingField(entry, '词性', row.part_of_speech)
          assignExistingField(entry, '词语解释', row.explanation)
          assignExistingField(entry, '专有名词', toJsonBoolean(row.is_proper_noun))
          assignExistingField(entry, 'オノマトペ', toJsonBoolean(row.is_onomatopoeia))
          assignExistingField(entry, '外来词', toJsonBoolean(row.is_loanword))
          assignExistingField(entry, '汉字词', toJsonBoolean(row.has_kanji))
          entriesUpdated += 1
        }
      }
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${jsonPath}.${stamp}.bak`
  fs.copyFileSync(jsonPath, backupPath)
  fs.writeFileSync(jsonPath, `${JSON.stringify(vocabularyJson, null, 2)}\n`, 'utf8')

  console.log(`Updated ${jsonPath}`)
  console.log(`Backup: ${backupPath}`)
  console.log(`Lessons: ${lessonsUpdated}, units: ${unitsUpdated}, entries: ${entriesUpdated}`)
  if (warnings.length > 0) {
    console.log('Warnings:')
    for (const warning of warnings) {
      console.log(`- ${warning}`)
    }
  }
}

main()
