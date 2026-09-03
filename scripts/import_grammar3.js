const fs = require('fs')
const path = require('path')
const Database = require('../backend/node_modules/better-sqlite3')
const { getGrammarSources, importGrammarSource } = require('../backend/database/seedGrammar')

const projectRoot = path.resolve(__dirname, '..')
const dataDirectory = path.resolve(process.env.SOUNICHI_DATA_DIR || path.join(projectRoot, 'data'))
const grammarDbPath = path.join(dataDirectory, 'grammar.db')

function backupFile(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${filePath}.${stamp}.before-import-grammar3.bak`
  fs.copyFileSync(filePath, backupPath)
  return backupPath
}

function main() {
  if (!fs.existsSync(grammarDbPath)) {
    throw new Error(`未找到文法数据库：${grammarDbPath}`)
  }

  const source = getGrammarSources(dataDirectory).find((item) => item.key === 'third')
  if (!source) throw new Error('未配置第三册文法数据源')

  const backupPath = backupFile(grammarDbPath)
  const db = new Database(grammarDbPath)
  db.pragma('foreign_keys = ON')

  try {
    const result = importGrammarSource(db, source, { replace: true })
    const textbook = db.prepare('SELECT id, name, order_index FROM textbooks WHERE name = ?').get(result.textbookName)
    const summary = db.prepare(`
      SELECT
        COUNT(*) AS entries,
        COUNT(DISTINCT lesson_id) AS lessons,
        COUNT(DISTINCT unit_id) AS units,
        SUM(CASE WHEN meaning IS NULL OR meaning = '' THEN 1 ELSE 0 END) AS missing_meanings,
        SUM(CASE WHEN examples_json = '[]' THEN 1 ELSE 0 END) AS entries_without_examples
      FROM grammar_entries
      WHERE textbook_id = ?
    `).get(textbook.id)

    // Keep the grammar selector aligned with the existing textbook ordering.
    db.prepare('UPDATE textbooks SET order_index = 4 WHERE name = ?').run('综合日语 第四册')
    console.log(JSON.stringify({ backupPath, textbook, ...result, ...summary }, null, 2))
  } finally {
    db.close()
  }
}

main()
