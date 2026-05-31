const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')
const { seedVocabularyFromJson } = require('./seedVocabulary')
const { seedGrammarFromJson } = require('./seedGrammar')
const { seedTextFromJson } = require('./seedText')

const dataDir = path.resolve(__dirname, '..', '..', 'data')
fs.mkdirSync(dataDir, { recursive: true })

const dbPaths = {
  user: path.join(dataDir, 'user_data.db'),
  vocabulary: path.join(dataDir, 'vocabulary.db'),
  grammar: path.join(dataDir, 'grammar.db'),
  text: path.join(dataDir, 'text.db'),
  readingMaterials: path.join(dataDir, 'reading_materials.db'),
  feedback: path.join(dataDir, 'feedback.db')
}

const dbExisted = {
  user: fs.existsSync(dbPaths.user),
  vocabulary: fs.existsSync(dbPaths.vocabulary),
  grammar: fs.existsSync(dbPaths.grammar),
  text: fs.existsSync(dbPaths.text),
  readingMaterials: fs.existsSync(dbPaths.readingMaterials),
  feedback: fs.existsSync(dbPaths.feedback)
}

const userDb = new Database(dbPaths.user)
const vocabularyDb = new Database(dbPaths.vocabulary)
const grammarDb = new Database(dbPaths.grammar)
const textDb = new Database(dbPaths.text)
const readingMaterialsDb = new Database(dbPaths.readingMaterials)
const feedbackDb = new Database(dbPaths.feedback)

userDb.pragma('foreign_keys = ON')
vocabularyDb.pragma('foreign_keys = ON')
grammarDb.pragma('foreign_keys = ON')
textDb.pragma('foreign_keys = ON')
readingMaterialsDb.pragma('foreign_keys = ON')
feedbackDb.pragma('foreign_keys = ON')

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
  }
}

function initUserDatabase() {
  userDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      user_type TEXT DEFAULT 'student',
      role TEXT DEFAULT 'user',
      is_initial_admin INTEGER DEFAULT 0,
      is_initial_dev INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)

  ensureColumn(userDb, 'users', 'email', 'email TEXT')
  ensureColumn(userDb, 'users', 'user_type', "user_type TEXT DEFAULT 'student'")
  ensureColumn(userDb, 'users', 'role', "role TEXT DEFAULT 'user'")
  ensureColumn(userDb, 'users', 'is_initial_admin', 'is_initial_admin INTEGER DEFAULT 0')
  ensureColumn(userDb, 'users', 'is_initial_dev', 'is_initial_dev INTEGER DEFAULT 0')
  ensureColumn(userDb, 'users', 'updated_at', "updated_at TEXT")

  userDb.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
    ON users(email)
    WHERE email IS NOT NULL AND email != ''
  `)
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_users_type ON users(user_type)')
}

function initVocabularyDatabase() {
  vocabularyDb.exec(`
    CREATE TABLE IF NOT EXISTS textbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      order_index INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)

  vocabularyDb.exec(`
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      textbook_id INTEGER NOT NULL,
      lesson_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (textbook_id) REFERENCES textbooks(id) ON DELETE CASCADE,
      UNIQUE(textbook_id, lesson_number)
    )
  `)

  vocabularyDb.exec(`
    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL,
      unit_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
      UNIQUE(lesson_id, unit_number)
    )
  `)

  vocabularyDb.exec(`
    CREATE TABLE IF NOT EXISTS vocabulary_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      textbook_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      table_type TEXT NOT NULL DEFAULT 'new',
      source_table_label TEXT,
      term TEXT NOT NULL,
      supplement TEXT,
      accent TEXT,
      part_of_speech TEXT,
      explanation TEXT,
      order_index INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (textbook_id) REFERENCES textbooks(id) ON DELETE CASCADE,
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    )
  `)

  vocabularyDb.exec('CREATE INDEX IF NOT EXISTS idx_vocab_context ON vocabulary_entries(textbook_id, lesson_id, unit_id, table_type)')
  vocabularyDb.exec('CREATE INDEX IF NOT EXISTS idx_vocab_term ON vocabulary_entries(term)')
  vocabularyDb.exec('CREATE INDEX IF NOT EXISTS idx_vocab_supplement ON vocabulary_entries(supplement)')
  vocabularyDb.exec('CREATE INDEX IF NOT EXISTS idx_lessons_textbook ON lessons(textbook_id)')
  vocabularyDb.exec('CREATE INDEX IF NOT EXISTS idx_units_lesson ON units(lesson_id)')

  const total = vocabularyDb.prepare('SELECT COUNT(*) AS total FROM vocabulary_entries').get().total
  if (!dbExisted.vocabulary || total === 0) {
    seedVocabularyFromJson(vocabularyDb)
  }
}

function initGrammarDatabase() {
  grammarDb.exec(`
    CREATE TABLE IF NOT EXISTS textbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      order_index INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)

  grammarDb.exec(`
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      textbook_id INTEGER NOT NULL,
      lesson_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (textbook_id) REFERENCES textbooks(id) ON DELETE CASCADE,
      UNIQUE(textbook_id, lesson_number)
    )
  `)

  grammarDb.exec(`
    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL,
      unit_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
      UNIQUE(lesson_id, unit_number)
    )
  `)

  grammarDb.exec(`
    CREATE TABLE IF NOT EXISTS grammar_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      textbook_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      unit_id INTEGER NOT NULL,
      grammar TEXT NOT NULL,
      brief_logic TEXT,
      meaning TEXT,
      translation TEXT,
      formation TEXT,
      notes TEXT,
      examples_json TEXT DEFAULT '[]',
      order_index INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (textbook_id) REFERENCES textbooks(id) ON DELETE CASCADE,
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    )
  `)

  grammarDb.exec('CREATE INDEX IF NOT EXISTS idx_grammar_context ON grammar_entries(textbook_id, lesson_id, unit_id)')
  grammarDb.exec('CREATE INDEX IF NOT EXISTS idx_grammar_text ON grammar_entries(grammar)')
  grammarDb.exec('CREATE INDEX IF NOT EXISTS idx_grammar_lessons_textbook ON lessons(textbook_id)')
  grammarDb.exec('CREATE INDEX IF NOT EXISTS idx_grammar_units_lesson ON units(lesson_id)')

  const total = grammarDb.prepare('SELECT COUNT(*) AS total FROM grammar_entries').get().total
  if (!dbExisted.grammar || total === 0) {
    seedGrammarFromJson(grammarDb)
  }
}

function initTextDatabase() {
  textDb.exec(`
    CREATE TABLE IF NOT EXISTS textbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      order_index INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)

  textDb.exec(`
    CREATE TABLE IF NOT EXISTS text_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      textbook_id INTEGER NOT NULL,
      lesson_number INTEGER NOT NULL,
      unit_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      order_index INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (textbook_id) REFERENCES textbooks(id) ON DELETE CASCADE
    )
  `)

  textDb.exec('CREATE INDEX IF NOT EXISTS idx_text_entries_textbook ON text_entries(textbook_id)')
  textDb.exec('CREATE INDEX IF NOT EXISTS idx_text_entries_lesson_unit ON text_entries(lesson_number, unit_number)')

  const total = textDb.prepare('SELECT COUNT(*) AS total FROM text_entries').get().total
  if (!dbExisted.text || total === 0) {
    seedTextFromJson(textDb)
  }
}

function initReadingMaterialsDatabase() {
  readingMaterialsDb.exec(`
    CREATE TABLE IF NOT EXISTS reading_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      file_category TEXT DEFAULT 'html',
      preview_file_path TEXT,
      conversion_status TEXT,
      conversion_error TEXT,
      converted_at TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)

  ensureColumn(readingMaterialsDb, 'reading_materials', 'mime_type', 'mime_type TEXT')
  ensureColumn(readingMaterialsDb, 'reading_materials', 'file_category', "file_category TEXT DEFAULT 'html'")
  ensureColumn(readingMaterialsDb, 'reading_materials', 'preview_file_path', 'preview_file_path TEXT')
  ensureColumn(readingMaterialsDb, 'reading_materials', 'conversion_status', 'conversion_status TEXT')
  ensureColumn(readingMaterialsDb, 'reading_materials', 'conversion_error', 'conversion_error TEXT')
  ensureColumn(readingMaterialsDb, 'reading_materials', 'converted_at', 'converted_at TEXT')
  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_reading_materials_created ON reading_materials(created_at)')
  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_reading_materials_hash ON reading_materials(content_hash)')
  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_reading_materials_category ON reading_materials(file_category)')
}

function initFeedbackDatabase() {
  function createFeedbackTable() {
    feedbackDb.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        feedback_type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `)
  }

  const tableExists = feedbackDb
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'feedback'")
    .get()

  if (!tableExists) {
    createFeedbackTable()
  } else {
    const columns = feedbackDb.prepare('PRAGMA table_info(feedback)').all().map((item) => item.name)
    const legacyColumns = ['username', 'satisfaction', 'comment', 'status', 'admin_note', 'updated_at']
    const needsMigration =
      !columns.includes('feedback_type') ||
      !columns.includes('content') ||
      legacyColumns.some((column) => columns.includes(column))

    if (needsMigration) {
      const contentExpression = columns.includes('comment')
        ? "COALESCE(NULLIF(TRIM(comment), ''), '旧反馈未填写内容')"
        : columns.includes('content')
          ? "COALESCE(NULLIF(TRIM(content), ''), '旧反馈未填写内容')"
          : "'旧反馈未填写内容'"
      const typeExpression = columns.includes('feedback_type')
        ? "COALESCE(NULLIF(TRIM(feedback_type), ''), '其他')"
        : "'其他'"
      const createdExpression = columns.includes('created_at')
        ? "COALESCE(created_at, datetime('now', 'localtime'))"
        : "datetime('now', 'localtime')"
      const userExpression = columns.includes('user_id') ? 'COALESCE(user_id, 0)' : '0'

      feedbackDb.exec('DROP TABLE IF EXISTS feedback_legacy')
      feedbackDb.exec('ALTER TABLE feedback RENAME TO feedback_legacy')
      createFeedbackTable()
      feedbackDb.exec(`
        INSERT INTO feedback (id, user_id, feedback_type, content, created_at)
        SELECT id, ${userExpression}, ${typeExpression}, ${contentExpression}, ${createdExpression}
        FROM feedback_legacy
      `)
      feedbackDb.exec('DROP TABLE feedback_legacy')
    }
  }

  feedbackDb.exec('CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id)')
  feedbackDb.exec('CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(feedback_type)')
  feedbackDb.exec('CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at)')
}

function initDatabase() {
  console.log('\n💾 数据库初始化...')
  console.log(`   • 用户数据库: ${dbPaths.user}`)
  initUserDatabase()

  console.log(`   • 词库数据库: ${dbPaths.vocabulary}`)
  initVocabularyDatabase()

  console.log(`   • 文法数据库: ${dbPaths.grammar}`)
  initGrammarDatabase()

  console.log(`   • 课文数据库: ${dbPaths.text}`)
  initTextDatabase()

  console.log(`   • 阅读材料数据库: ${dbPaths.readingMaterials}`)
  initReadingMaterialsDatabase()

  console.log(`   • 反馈数据库: ${dbPaths.feedback}`)
  initFeedbackDatabase()
  console.log('   ✓ 数据库初始化完成')
}

module.exports = {
  dataDir,
  dbPaths,
  userDb,
  vocabularyDb,
  grammarDb,
  textDb,
  readingMaterialsDb,
  feedbackDb,
  initDatabase
}
