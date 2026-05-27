const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')
const { seedVocabularyFromJson } = require('./seedVocabulary')

const dataDir = path.resolve(__dirname, '..', '..', 'data')
fs.mkdirSync(dataDir, { recursive: true })

const dbPaths = {
  user: path.join(dataDir, 'user_data.db'),
  vocabulary: path.join(dataDir, 'vocabulary.db'),
  feedback: path.join(dataDir, 'feedback.db')
}

const dbExisted = {
  user: fs.existsSync(dbPaths.user),
  vocabulary: fs.existsSync(dbPaths.vocabulary),
  feedback: fs.existsSync(dbPaths.feedback)
}

const userDb = new Database(dbPaths.user)
const vocabularyDb = new Database(dbPaths.vocabulary)
const feedbackDb = new Database(dbPaths.feedback)

userDb.pragma('foreign_keys = ON')
vocabularyDb.pragma('foreign_keys = ON')
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

function initFeedbackDatabase() {
  feedbackDb.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      satisfaction INTEGER NOT NULL CHECK(satisfaction >= 1 AND satisfaction <= 4),
      comment TEXT,
      status TEXT DEFAULT 'open',
      admin_note TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)

  feedbackDb.exec('CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id)')
  feedbackDb.exec('CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status)')
  feedbackDb.exec('CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at)')
}

function initDatabase() {
  console.log('\n💾 数据库初始化...')
  console.log(`   • 用户数据库: ${dbPaths.user}`)
  initUserDatabase()

  console.log(`   • 词库数据库: ${dbPaths.vocabulary}`)
  initVocabularyDatabase()

  console.log(`   • 反馈数据库: ${dbPaths.feedback}`)
  initFeedbackDatabase()
  console.log('   ✓ 数据库初始化完成')
}

module.exports = {
  dataDir,
  dbPaths,
  userDb,
  vocabularyDb,
  feedbackDb,
  initDatabase
}
