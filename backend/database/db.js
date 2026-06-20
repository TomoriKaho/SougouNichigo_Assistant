const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')
const { seedVocabularyFromJson } = require('./seedVocabulary')
const { seedGrammarFromJson } = require('./seedGrammar')
const { seedTextFromJson } = require('./seedText')
const { deriveVocabularyFlags } = require('../lib/vocabularyFlags')

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
      grade TEXT DEFAULT '高年级',
      share_context_chats INTEGER DEFAULT 1,
      role TEXT DEFAULT 'user',
      is_initial_admin INTEGER DEFAULT 0,
      is_initial_dev INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)

  ensureColumn(userDb, 'users', 'email', 'email TEXT')
  ensureColumn(userDb, 'users', 'user_type', "user_type TEXT DEFAULT 'student'")
  ensureColumn(userDb, 'users', 'grade', "grade TEXT DEFAULT '高年级'")
  ensureColumn(userDb, 'users', 'share_context_chats', 'share_context_chats INTEGER DEFAULT 1')
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

  userDb.exec(`
    CREATE TABLE IF NOT EXISTS email_verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      attempt_count INTEGER DEFAULT 0,
      request_ip TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_email_codes_lookup ON email_verification_codes(email, purpose, consumed_at, expires_at)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_email_codes_created_at ON email_verification_codes(created_at)')
  userDb.exec(`
    UPDATE users
    SET grade = CASE
      WHEN user_type = 'teacher' THEN '教师'
      WHEN grade IS NULL OR trim(grade) = '' OR grade = '教师' THEN '高年级'
      ELSE grade
    END
  `)
  userDb.exec(`
    UPDATE users
    SET share_context_chats = CASE
      WHEN share_context_chats IS NULL THEN 1
      WHEN share_context_chats IN (0, 1) THEN share_context_chats
      ELSE 1
    END
  `)

  userDb.exec(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      teacher_user_id INTEGER NOT NULL,
      allow_student_uploads INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (teacher_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  ensureColumn(userDb, 'classes', 'allow_student_uploads', 'allow_student_uploads INTEGER DEFAULT 0')

  const membershipTable = userDb
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'class_memberships'")
    .get()

  if (!membershipTable) {
    userDb.exec(`
      CREATE TABLE class_memberships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        member_role TEXT NOT NULL DEFAULT 'student',
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        UNIQUE(class_id, user_id),
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `)
  } else {
    const columns = userDb.prepare('PRAGMA table_info(class_memberships)').all().map((item) => item.name)
    const needsMigration = columns.includes('student_user_id') || !columns.includes('user_id') || !columns.includes('member_role')

    if (needsMigration) {
      const legacyUserExpression = columns.includes('user_id')
        ? 'user_id'
        : columns.includes('student_user_id')
          ? 'student_user_id'
          : 'NULL'
      const legacyRoleExpression = columns.includes('member_role')
        ? "COALESCE(NULLIF(TRIM(member_role), ''), 'student')"
        : "'student'"
      const legacyCreatedExpression = columns.includes('created_at')
        ? "COALESCE(created_at, datetime('now', 'localtime'))"
        : "datetime('now', 'localtime')"

      userDb.exec('DROP TABLE IF EXISTS class_memberships_legacy')
      userDb.exec('ALTER TABLE class_memberships RENAME TO class_memberships_legacy')
      userDb.exec(`
        CREATE TABLE class_memberships (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          class_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          member_role TEXT NOT NULL DEFAULT 'student',
          created_at TEXT DEFAULT (datetime('now', 'localtime')),
          UNIQUE(class_id, user_id),
          FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `)
      userDb.exec(`
        INSERT OR IGNORE INTO class_memberships (id, class_id, user_id, member_role, created_at)
        SELECT
          id,
          class_id,
          ${legacyUserExpression},
          ${legacyRoleExpression},
          ${legacyCreatedExpression}
        FROM class_memberships_legacy
      `)
      userDb.exec('DROP TABLE class_memberships_legacy')
    }
  }

  userDb.exec('CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_user_id)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_classes_code ON classes(code)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_class_memberships_class ON class_memberships(class_id)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_class_memberships_user ON class_memberships(user_id)')

  userDb.exec(`
    INSERT OR IGNORE INTO class_memberships (class_id, user_id, member_role, created_at)
    SELECT
      c.id,
      c.teacher_user_id,
      'teacher',
      c.created_at
    FROM classes c
  `)

  userDb.exec(`
    CREATE TABLE IF NOT EXISTS assistant_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      context_type TEXT NOT NULL DEFAULT 'none',
      context_id INTEGER,
      context_label TEXT,
      context_snapshot_json TEXT,
      template_key TEXT NOT NULL DEFAULT 'general_qa',
      visibility TEXT NOT NULL DEFAULT 'private',
      reply_status TEXT NOT NULL DEFAULT 'idle',
      reply_started_at TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  ensureColumn(userDb, 'assistant_conversations', 'reply_status', "reply_status TEXT NOT NULL DEFAULT 'idle'")
  ensureColumn(userDb, 'assistant_conversations', 'reply_started_at', 'reply_started_at TEXT')

  userDb.exec(`
    CREATE TABLE IF NOT EXISTS assistant_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      used_web_search INTEGER DEFAULT 0,
      citations_json TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (conversation_id) REFERENCES assistant_conversations(id) ON DELETE CASCADE
    )
  `)

  userDb.exec('CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user ON assistant_conversations(user_id)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_assistant_conversations_context ON assistant_conversations(context_type, context_id)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_assistant_conversations_updated ON assistant_conversations(updated_at)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation ON assistant_messages(conversation_id)')

  userDb.exec(`
    CREATE TABLE IF NOT EXISTS text_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      text_id INTEGER NOT NULL,
      start_offset INTEGER NOT NULL,
      end_offset INTEGER NOT NULL,
      selected_text TEXT NOT NULL,
      note_content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  userDb.exec('CREATE INDEX IF NOT EXISTS idx_text_notes_user_text ON text_notes(user_id, text_id)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_text_notes_offsets ON text_notes(text_id, start_offset, end_offset)')

  userDb.exec(`
    CREATE TABLE IF NOT EXISTS translation_practices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question_set_id INTEGER,
      textbook_id INTEGER NOT NULL,
      textbook_name TEXT NOT NULL,
      range_key TEXT NOT NULL,
      range_label TEXT NOT NULL,
      lesson_min INTEGER NOT NULL,
      lesson_max INTEGER NOT NULL,
      ability_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      grammar_json TEXT NOT NULL DEFAULT '[]',
      vocabulary_json TEXT NOT NULL DEFAULT '[]',
      exercise_json TEXT NOT NULL DEFAULT '{}',
      answer_json TEXT,
      review_json TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  ensureColumn(userDb, 'translation_practices', 'question_set_id', 'question_set_id INTEGER')

  userDb.exec(`
    CREATE TABLE IF NOT EXISTS translation_practice_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      textbook_id INTEGER NOT NULL,
      textbook_name TEXT NOT NULL,
      range_key TEXT NOT NULL,
      range_label TEXT NOT NULL,
      lesson_min INTEGER NOT NULL,
      lesson_max INTEGER NOT NULL,
      ability_label TEXT NOT NULL,
      direction_mode TEXT NOT NULL,
      difficulty_mode TEXT NOT NULL,
      grammar_json TEXT NOT NULL DEFAULT '[]',
      vocabulary_json TEXT NOT NULL DEFAULT '[]',
      exercise_json TEXT NOT NULL DEFAULT '{}',
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `)

  userDb.exec(`
    CREATE TABLE IF NOT EXISTS translation_practice_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      practice_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (practice_id) REFERENCES translation_practices(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  userDb.exec('CREATE INDEX IF NOT EXISTS idx_translation_practices_user ON translation_practices(user_id, updated_at)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_translation_practices_set ON translation_practices(question_set_id)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_translation_sets_lookup ON translation_practice_sets(textbook_id, range_key, direction_mode, difficulty_mode, created_at)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_translation_messages_practice ON translation_practice_messages(practice_id, created_at)')

  userDb.exec(`
    CREATE TABLE IF NOT EXISTS text_cloze_practice_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text_id INTEGER NOT NULL,
      textbook_name TEXT NOT NULL,
      lesson_number INTEGER NOT NULL,
      unit_number INTEGER NOT NULL,
      text_title TEXT NOT NULL,
      content_snapshot TEXT NOT NULL,
      question_count INTEGER NOT NULL DEFAULT 0,
      vocabulary_json TEXT NOT NULL DEFAULT '[]',
      grammar_json TEXT NOT NULL DEFAULT '[]',
      questions_json TEXT NOT NULL DEFAULT '[]',
      source_candidates_json TEXT NOT NULL DEFAULT '[]',
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `)

  userDb.exec(`
    CREATE TABLE IF NOT EXISTS text_cloze_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      set_id INTEGER NOT NULL,
      text_id INTEGER NOT NULL,
      answers_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT NOT NULL DEFAULT '{}',
      submitted_at TEXT DEFAULT (datetime('now', 'localtime')),
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (set_id) REFERENCES text_cloze_practice_sets(id) ON DELETE CASCADE
    )
  `)

  userDb.exec('CREATE INDEX IF NOT EXISTS idx_text_cloze_sets_text ON text_cloze_practice_sets(text_id, created_at)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_text_cloze_attempts_user_text ON text_cloze_attempts(user_id, text_id, submitted_at)')
  userDb.exec('CREATE INDEX IF NOT EXISTS idx_text_cloze_attempts_user_set ON text_cloze_attempts(user_id, set_id)')
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
      is_key_word INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (textbook_id) REFERENCES textbooks(id) ON DELETE CASCADE,
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE
    )
  `)

  ensureColumn(vocabularyDb, 'vocabulary_entries', 'is_proper_noun', 'is_proper_noun INTEGER DEFAULT 0')
  ensureColumn(vocabularyDb, 'vocabulary_entries', 'is_onomatopoeia', 'is_onomatopoeia INTEGER DEFAULT 0')
  ensureColumn(vocabularyDb, 'vocabulary_entries', 'is_loanword', 'is_loanword INTEGER DEFAULT 0')
  ensureColumn(vocabularyDb, 'vocabulary_entries', 'has_kanji', 'has_kanji INTEGER DEFAULT 0')
  ensureColumn(vocabularyDb, 'vocabulary_entries', 'is_key_word', 'is_key_word INTEGER DEFAULT 1')
  vocabularyDb.exec('UPDATE vocabulary_entries SET is_key_word = 1 WHERE is_key_word IS NULL')

  vocabularyDb.exec(`
    CREATE TABLE IF NOT EXISTS vocabulary_favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      vocabulary_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(user_id, vocabulary_id),
      FOREIGN KEY (vocabulary_id) REFERENCES vocabulary_entries(id) ON DELETE CASCADE
    )
  `)

  vocabularyDb.exec('CREATE INDEX IF NOT EXISTS idx_vocab_context ON vocabulary_entries(textbook_id, lesson_id, unit_id, table_type)')
  vocabularyDb.exec('CREATE INDEX IF NOT EXISTS idx_vocab_term ON vocabulary_entries(term)')
  vocabularyDb.exec('CREATE INDEX IF NOT EXISTS idx_vocab_supplement ON vocabulary_entries(supplement)')
  vocabularyDb.exec('CREATE INDEX IF NOT EXISTS idx_lessons_textbook ON lessons(textbook_id)')
  vocabularyDb.exec('CREATE INDEX IF NOT EXISTS idx_units_lesson ON units(lesson_id)')
  vocabularyDb.exec('CREATE INDEX IF NOT EXISTS idx_vocab_favorites_user ON vocabulary_favorites(user_id)')
  vocabularyDb.exec('CREATE INDEX IF NOT EXISTS idx_vocab_favorites_entry ON vocabulary_favorites(vocabulary_id)')

  seedVocabularyFromJson(vocabularyDb)

  const rows = vocabularyDb.prepare(`
    SELECT id, term, supplement, part_of_speech, explanation
    FROM vocabulary_entries
  `).all()

  const updateFlags = vocabularyDb.prepare(`
    UPDATE vocabulary_entries
    SET
      is_proper_noun = ?,
      is_onomatopoeia = ?,
      is_loanword = ?,
      has_kanji = ?
    WHERE id = ?
  `)

  vocabularyDb.transaction(() => {
    rows.forEach((row) => {
      const flags = deriveVocabularyFlags({
        term: row.term,
        supplement: row.supplement,
        partOfSpeech: row.part_of_speech,
        explanation: row.explanation
      })
      updateFlags.run(
        flags.properNoun ? 1 : 0,
        flags.onomatopoeia ? 1 : 0,
        flags.loanword ? 1 : 0,
        flags.kanjiWord ? 1 : 0,
        row.id
      )
    })
  })()
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

  grammarDb.exec(`
    CREATE TABLE IF NOT EXISTS grammar_favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      grammar_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(user_id, grammar_id),
      FOREIGN KEY (grammar_id) REFERENCES grammar_entries(id) ON DELETE CASCADE
    )
  `)

  grammarDb.exec('CREATE INDEX IF NOT EXISTS idx_grammar_context ON grammar_entries(textbook_id, lesson_id, unit_id)')
  grammarDb.exec('CREATE INDEX IF NOT EXISTS idx_grammar_text ON grammar_entries(grammar)')
  grammarDb.exec('CREATE INDEX IF NOT EXISTS idx_grammar_lessons_textbook ON lessons(textbook_id)')
  grammarDb.exec('CREATE INDEX IF NOT EXISTS idx_grammar_units_lesson ON units(lesson_id)')
  grammarDb.exec('CREATE INDEX IF NOT EXISTS idx_grammar_favorites_user ON grammar_favorites(user_id)')
  grammarDb.exec('CREATE INDEX IF NOT EXISTS idx_grammar_favorites_entry ON grammar_favorites(grammar_id)')

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

  seedTextFromJson(textDb)
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
  ensureColumn(readingMaterialsDb, 'reading_materials', 'class_id', 'class_id INTEGER')
  ensureColumn(readingMaterialsDb, 'reading_materials', 'preview_file_path', 'preview_file_path TEXT')
  ensureColumn(readingMaterialsDb, 'reading_materials', 'conversion_status', 'conversion_status TEXT')
  ensureColumn(readingMaterialsDb, 'reading_materials', 'conversion_error', 'conversion_error TEXT')
  ensureColumn(readingMaterialsDb, 'reading_materials', 'converted_at', 'converted_at TEXT')
  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_reading_materials_created ON reading_materials(created_at)')
  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_reading_materials_hash ON reading_materials(content_hash)')
  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_reading_materials_category ON reading_materials(file_category)')
  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_reading_materials_class ON reading_materials(class_id)')

  readingMaterialsDb.exec(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      is_public INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `)

  readingMaterialsDb.exec(`
    CREATE TABLE IF NOT EXISTS assignment_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL,
      file_role TEXT NOT NULL DEFAULT 'assignment',
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      file_category TEXT DEFAULT 'file',
      file_size INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
    )
  `)

  readingMaterialsDb.exec(`
    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      text_content TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
    )
  `)

  readingMaterialsDb.exec(`
    CREATE TABLE IF NOT EXISTS assignment_submission_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      file_category TEXT DEFAULT 'file',
      file_size INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (submission_id) REFERENCES assignment_submissions(id) ON DELETE CASCADE
    )
  `)

  readingMaterialsDb.exec(`
    CREATE TABLE IF NOT EXISTS assignment_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL,
      student_user_id INTEGER NOT NULL,
      submission_id INTEGER,
      teacher_user_id INTEGER NOT NULL,
      text_content TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(assignment_id, student_user_id),
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (submission_id) REFERENCES assignment_submissions(id) ON DELETE SET NULL
    )
  `)

  readingMaterialsDb.exec(`
    CREATE TABLE IF NOT EXISTS assignment_feedback_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedback_id INTEGER NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      file_category TEXT DEFAULT 'file',
      file_size INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (feedback_id) REFERENCES assignment_feedback(id) ON DELETE CASCADE
    )
  `)

  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id)')
  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_assignments_created ON assignments(created_at)')
  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_assignment_files_assignment ON assignment_files(assignment_id)')
  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment ON assignment_submissions(assignment_id)')
  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_assignment_submissions_user ON assignment_submissions(user_id)')
  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_assignment_feedback_assignment ON assignment_feedback(assignment_id)')
  readingMaterialsDb.exec('CREATE INDEX IF NOT EXISTS idx_assignment_feedback_student ON assignment_feedback(student_user_id)')
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
