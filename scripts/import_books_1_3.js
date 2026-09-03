const fs = require('fs')
const path = require('path')

const Database = require('../backend/node_modules/better-sqlite3')
const { deriveVocabularyFlags } = require('../backend/lib/vocabularyFlags')
const { normalizeVocabularyWordFields } = require('../backend/lib/vocabularyTermNormalizer')

const projectRoot = path.resolve(__dirname, '..')
const dataDirectory = path.resolve(process.env.SOUNICHI_DATA_DIR || path.join(projectRoot, 'data'))
const vocabularyDbPath = path.join(dataDirectory, 'vocabulary.db')
const textDbPath = path.join(dataDirectory, 'text.db')

const SOURCES = [
  {
    textbookName: '综合日语 第一册',
    orderIndex: 3,
    vocabularyFile: '综合日语一单词_第2-12课.json',
    textFile: '综合日语第一册_课文识别整理.json'
  },
  {
    textbookName: '综合日语 第三册',
    orderIndex: 4,
    vocabularyFile: '综合日语三单词_第1-10课.json',
    textFile: '综合日语第三册_课文识别整理.json'
  }
]

function normalizeText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text || null
}

function normalizeTableType(label) {
  const value = String(label || '').trim()
  return value.includes('練習') || value.includes('练习') ? 'practice' : 'new'
}

function backupFile(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${filePath}.${stamp}.before-import-books-1-3.bak`
  fs.copyFileSync(filePath, backupPath)
  return backupPath
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(dataDirectory, fileName), 'utf8'))
}

function writeJson(fileName, value) {
  fs.writeFileSync(path.join(dataDirectory, fileName), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function validateVocabularySource(source, lessons) {
  if (!Array.isArray(lessons) || lessons.length === 0) {
    throw new Error(`${source.vocabularyFile} 顶层必须是非空数组`)
  }

  for (const lesson of lessons) {
    if (!Number(lesson['课序'])) throw new Error(`${source.vocabularyFile} 存在缺失课序的词表`)
    for (const unit of lesson['单元'] || []) {
      if (!Number(unit['单元序'])) throw new Error(`${source.vocabularyFile} 第${lesson['课序']}课存在缺失单元序的词表`)
      for (const table of unit['词表'] || []) {
        for (const word of table['词条列表'] || []) {
          if (!normalizeText(word['词条'])) {
            throw new Error(`${source.vocabularyFile} 第${lesson['课序']}课存在空词条`)
          }
        }
      }
    }
  }
}

function validateTextSource(source, raw) {
  if (!Array.isArray(raw?.['课文']) || raw['课文'].length === 0) {
    throw new Error(`${source.textFile} 必须包含非空的「课文」数组`)
  }

  for (const text of raw['课文']) {
    if (!Number(text['课程序号']) || !Number(text['单元序号'])) {
      throw new Error(`${source.textFile} 存在缺失课次或单元序号的课文`)
    }
    if (!normalizeText(text['标题']) || !normalizeText(text['全部文本'])) {
      throw new Error(`${source.textFile} 第${text['课程序号']}课第${text['单元序号']}单元存在空标题或全文`)
    }
  }
}

function enrichVocabularyFields(lessons) {
  const summary = {
    entries: 0,
    properNouns: 0,
    onomatopoeia: 0,
    loanwords: 0,
    kanjiWords: 0
  }

  for (const lesson of lessons) {
    for (const unit of lesson['单元'] || []) {
      for (const table of unit['词表'] || []) {
        for (const word of table['词条列表'] || []) {
          const normalizedWord = normalizeVocabularyWordFields(word)
          const flags = deriveVocabularyFlags({
            term: normalizedWord.term,
            supplement: normalizedWord.supplement,
            partOfSpeech: word['词性'],
            explanation: word['词语解释'] || word['解释']
          })

          word['专有名词'] = flags.properNoun
          word['オノマトペ'] = flags.onomatopoeia
          word['外来词'] = flags.loanword
          word['汉字词'] = flags.kanjiWord

          summary.entries += 1
          if (flags.properNoun) summary.properNouns += 1
          if (flags.onomatopoeia) summary.onomatopoeia += 1
          if (flags.loanword) summary.loanwords += 1
          if (flags.kanjiWord) summary.kanjiWords += 1
        }
      }
    }
  }

  return summary
}

function ensureTextbook(db, textbookName, orderIndex) {
  const existing = db.prepare('SELECT id FROM textbooks WHERE name = ?').get(textbookName)
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
  `).run(textbookName, orderIndex).lastInsertRowid
}

function ensureLesson(db, textbookId, lessonNumber, title) {
  const existing = db.prepare(`
    SELECT id
    FROM lessons
    WHERE textbook_id = ? AND lesson_number = ?
  `).get(textbookId, lessonNumber)

  if (existing) {
    db.prepare(`
      UPDATE lessons
      SET title = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(title, existing.id)
    return existing.id
  }

  return db.prepare(`
    INSERT INTO lessons (textbook_id, lesson_number, title, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(textbookId, lessonNumber, title).lastInsertRowid
}

function ensureUnit(db, lessonId, unitNumber, name) {
  const existing = db.prepare(`
    SELECT id
    FROM units
    WHERE lesson_id = ? AND unit_number = ?
  `).get(lessonId, unitNumber)

  if (existing) {
    db.prepare(`
      UPDATE units
      SET name = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(name, existing.id)
    return existing.id
  }

  return db.prepare(`
    INSERT INTO units (lesson_id, unit_number, name, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(lessonId, unitNumber, name).lastInsertRowid
}

function replaceVocabularyTextbook(db, source, lessons) {
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

  let deleted = 0
  let inserted = 0
  db.transaction(() => {
    const textbookId = ensureTextbook(db, source.textbookName, source.orderIndex)
    deleted = db.prepare('DELETE FROM vocabulary_entries WHERE textbook_id = ?').run(textbookId).changes

    for (const lesson of lessons) {
      const lessonNumber = Number(lesson['课序'])
      const lessonId = ensureLesson(db, textbookId, lessonNumber, normalizeText(lesson['课名']) || `第${lessonNumber}课`)

      for (const unit of lesson['单元'] || []) {
        const unitNumber = Number(unit['单元序'])
        const unitId = ensureUnit(db, lessonId, unitNumber, normalizeText(unit['单元名']) || `ユニット${unitNumber}`)

        for (const table of unit['词表'] || []) {
          const sourceLabel = normalizeText(table['词表类型']) || '新出単語'
          for (const word of table['词条列表'] || []) {
            const normalizedWord = normalizeVocabularyWordFields(word)
            if (!normalizedWord.term) continue

            inserted += 1
            insertEntry.run(
              textbookId,
              lessonId,
              unitId,
              normalizeTableType(sourceLabel),
              sourceLabel,
              normalizedWord.term,
              normalizedWord.supplement,
              normalizeText(word['声调']),
              normalizeText(word['词性']),
              normalizeText(word['词语解释'] || word['解释']),
              word['专有名词'] ? 1 : 0,
              word['オノマトペ'] ? 1 : 0,
              word['外来词'] ? 1 : 0,
              word['汉字词'] ? 1 : 0,
              1,
              inserted
            )
          }
        }
      }
    }
  })()

  return { deleted, inserted }
}

function upsertTextbookTexts(db, source, raw) {
  const findEntry = db.prepare(`
    SELECT id
    FROM text_entries
    WHERE textbook_id = ? AND lesson_number = ? AND unit_number = ?
    ORDER BY id
    LIMIT 1
  `)
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
  const updateEntry = db.prepare(`
    UPDATE text_entries
    SET title = ?, content = ?, order_index = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `)

  let inserted = 0
  let updated = 0
  db.transaction(() => {
    const textbookId = ensureTextbook(db, source.textbookName, source.orderIndex)
    raw['课文'].forEach((entry, index) => {
      const lessonNumber = Number(entry['课程序号'])
      const unitNumber = Number(entry['单元序号'])
      const existing = findEntry.get(textbookId, lessonNumber, unitNumber)
      const values = [
        normalizeText(entry['标题']) || `课文${index + 1}`,
        normalizeText(entry['全部文本']) || '',
        index + 1
      ]

      if (existing) {
        updateEntry.run(...values, existing.id)
        updated += 1
      } else {
        insertEntry.run(textbookId, lessonNumber, unitNumber, ...values)
        inserted += 1
      }
    })
  })()

  return { inserted, updated }
}

function main() {
  const vocabularySources = SOURCES.map((source) => ({
    source,
    lessons: readJson(source.vocabularyFile)
  }))
  const textSources = SOURCES.map((source) => ({
    source,
    raw: readJson(source.textFile)
  }))

  vocabularySources.forEach(({ source, lessons }) => validateVocabularySource(source, lessons))
  textSources.forEach(({ source, raw }) => validateTextSource(source, raw))

  const jsonBackups = []
  const fieldSummaries = []
  vocabularySources.forEach(({ source, lessons }) => {
    jsonBackups.push(backupFile(path.join(dataDirectory, source.vocabularyFile)))
    fieldSummaries.push({ textbookName: source.textbookName, ...enrichVocabularyFields(lessons) })
    writeJson(source.vocabularyFile, lessons)
  })

  const vocabularyDbBackup = backupFile(vocabularyDbPath)
  const textDbBackup = backupFile(textDbPath)
  const vocabularyDb = new Database(vocabularyDbPath)
  const textDb = new Database(textDbPath)

  try {
    const vocabularyResults = vocabularySources.map(({ source, lessons }) => ({
      textbookName: source.textbookName,
      ...replaceVocabularyTextbook(vocabularyDb, source, lessons)
    }))
    const textResults = textSources.map(({ source, raw }) => ({
      textbookName: source.textbookName,
      ...upsertTextbookTexts(textDb, source, raw)
    }))

    console.log(JSON.stringify({
      jsonBackups,
      vocabularyDbBackup,
      textDbBackup,
      fieldSummaries,
      vocabularyResults,
      textResults
    }, null, 2))
  } finally {
    vocabularyDb.close()
    textDb.close()
  }
}

main()
