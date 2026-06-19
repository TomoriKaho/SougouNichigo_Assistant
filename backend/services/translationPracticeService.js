const { grammarDb, textDb, vocabularyDb } = require('../database/db')
const { TranslationPractice } = require('../models/TranslationPractice')
const { User } = require('../models/User')
const { completeChat } = require('./aiProvider')

const FOURTH_BOOK_NAME = '综合日语 第四册'

const ABILITY_BY_RANGE = {
  '综合日语 第一册:upper': 'N5以内',
  '综合日语 第一册:lower': 'N5到weak N4',
  '综合日语 第二册:upper': 'N4以内',
  '综合日语 第二册:lower': 'N4到weak N3',
  '综合日语 第三册:upper': 'N3以内',
  '综合日语 第三册:lower': 'N3到weak N2',
  '综合日语 第四册:upper': 'N2以内',
  '综合日语 第四册:lower': 'N2到weak N1'
}

const STUDENT_GRADE_HINTS = {
  大一上: '通常接近综合日语第一册上半或N5起步阶段',
  大一下: '通常接近综合日语第一册下半到第二册上半',
  大二上: '通常接近综合日语第二册下半到第三册上半',
  大二下: '通常接近综合日语第三册下半到第四册上半',
  高年级: '可按N1上限处理，但题目仍应根据所选教材范围控制难度',
  教师: '教师视角，可展示完整分析'
}

function clean(value) {
  const text = String(value ?? '').trim()
  return text || '-'
}

function parseExamples(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    return []
  }
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractJson(text) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : raw
  const firstObject = candidate.indexOf('{')
  const lastObject = candidate.lastIndexOf('}')
  if (firstObject >= 0 && lastObject > firstObject) {
    return JSON.parse(candidate.slice(firstObject, lastObject + 1))
  }
  throw new Error('AI 返回内容不是有效 JSON')
}

function pickItems(rows, count) {
  const copy = [...rows]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const item = copy[index]
    copy[index] = copy[swapIndex]
    copy[swapIndex] = item
  }
  return copy.slice(0, count)
}

function rangeKeyFor(textbookName, rangeKey) {
  return `${textbookName}:${rangeKey}`
}

function currentFourthBook() {
  return textDb.prepare(`
    SELECT id, name
    FROM textbooks
    WHERE name = ?
    LIMIT 1
  `).get(FOURTH_BOOK_NAME)
}

function fourthBookMaxLesson() {
  const row = grammarDb.prepare(`
    SELECT MAX(l.lesson_number) AS max_lesson
    FROM grammar_entries g
    JOIN textbooks t ON t.id = g.textbook_id
    JOIN lessons l ON l.id = g.lesson_id
    WHERE t.name = ?
  `).get(FOURTH_BOOK_NAME)
  return Number(row?.max_lesson || 10)
}

function resolveRange(rangeKey = 'upper') {
  const textbook = currentFourthBook()
  if (!textbook) {
    const error = new Error('目前尚未录入第四册课文')
    error.status = 404
    throw error
  }

  const maxLesson = fourthBookMaxLesson()
  const split = Math.ceil(maxLesson / 2)
  const normalized = rangeKey === 'lower' ? 'lower' : 'upper'
  const lessonMin = normalized === 'lower' ? split + 1 : 1
  const lessonMax = normalized === 'lower' ? maxLesson : split
  const rangeLabel = normalized === 'lower' ? '下半' : '上半'

  return {
    textbookId: textbook.id,
    textbookName: textbook.name,
    rangeKey: normalized,
    rangeLabel,
    lessonMin,
    lessonMax,
    abilityLabel: ABILITY_BY_RANGE[rangeKeyFor(textbook.name, normalized)] || 'N2以内'
  }
}

function listRangeOptions() {
  const range = resolveRange('upper')
  const lower = resolveRange('lower')
  return {
    ranges: [
      { ...range, label: `${range.textbookName} ${range.rangeLabel}` },
      { ...lower, label: `${lower.textbookName} ${lower.rangeLabel}` }
    ],
    abilityModel: [
      { range: '综合日语第一册上半', ability: 'N5以内' },
      { range: '综合日语第一册下半', ability: 'N5到weak N4' },
      { range: '综合日语第二册上半', ability: 'N4以内' },
      { range: '综合日语第二册下半', ability: 'N4到weak N3' },
      { range: '综合日语第三册上半', ability: 'N3以内' },
      { range: '综合日语第三册下半', ability: 'N3到weak N2' },
      { range: '综合日语第四册上半', ability: 'N2以内' },
      { range: '综合日语第四册下半', ability: 'N2到weak N1' },
      { range: '高年级', ability: 'N1水平' }
    ]
  }
}

function grammarForRange(range) {
  return grammarDb.prepare(`
    SELECT
      g.id,
      g.grammar,
      g.brief_logic,
      g.meaning,
      g.translation,
      g.formation,
      g.notes,
      g.examples_json,
      l.lesson_number,
      u.unit_number
    FROM grammar_entries g
    JOIN textbooks t ON t.id = g.textbook_id
    JOIN lessons l ON l.id = g.lesson_id
    JOIN units u ON u.id = g.unit_id
    WHERE t.name = ?
      AND l.lesson_number BETWEEN ? AND ?
    ORDER BY l.lesson_number ASC, u.unit_number ASC, g.id ASC
  `).all(range.textbookName, range.lessonMin, range.lessonMax).map((row) => ({
    ...row,
    examples: parseExamples(row.examples_json).slice(0, 2)
  }))
}

function vocabularyForRange(range) {
  return vocabularyDb.prepare(`
    SELECT
      v.id,
      v.term,
      v.supplement,
      v.part_of_speech,
      v.explanation,
      v.is_key_word,
      l.lesson_number,
      u.unit_number
    FROM vocabulary_entries v
    JOIN textbooks t ON t.id = v.textbook_id
    JOIN lessons l ON l.id = v.lesson_id
    JOIN units u ON u.id = v.unit_id
    WHERE t.name = ?
      AND l.lesson_number BETWEEN ? AND ?
    ORDER BY v.is_key_word DESC, l.lesson_number ASC, u.unit_number ASC, v.id ASC
    LIMIT 80
  `).all(range.textbookName, range.lessonMin, range.lessonMax).map((row) => ({
    ...row,
    is_key_word: !!row.is_key_word
  }))
}

function textSamplesForRange(range) {
  return textDb.prepare(`
    SELECT title, content, lesson_number, unit_number
    FROM text_entries e
    JOIN textbooks t ON t.id = e.textbook_id
    WHERE t.name = ?
      AND e.lesson_number BETWEEN ? AND ?
    ORDER BY e.lesson_number ASC, e.unit_number ASC
    LIMIT 4
  `).all(range.textbookName, range.lessonMin, range.lessonMax).map((item) => ({
    title: item.title,
    lesson_number: item.lesson_number,
    unit_number: item.unit_number,
    excerpt: stripHtml(item.content).slice(0, 160)
  }))
}

function normalizeDirectionMode(value) {
  return value === 'zh_to_jp' ? 'zh_to_jp' : 'jp_to_zh'
}

function normalizeDifficultyMode(value) {
  return value === 'hard' ? 'hard' : 'normal'
}

function directionLabel(directionMode) {
  return directionMode === 'zh_to_jp' ? '汉译日' : '日译汉'
}

function difficultyLabel(difficultyMode) {
  return difficultyMode === 'hard' ? '困难' : '普通'
}

function generationPrompt({ range, user, grammar, vocabulary, textSamples, directionMode, difficultyMode }) {
  const userGrade = clean(user?.grade)
  const gradeHint = STUDENT_GRADE_HINTS[userGrade] || '未提供年级，按所选教材范围控制'
  const direction = normalizeDirectionMode(directionMode)
  const difficulty = normalizeDifficultyMode(difficultyMode)
  const isZhToJp = direction === 'zh_to_jp'
  const lengthRequirement = difficulty === 'hard'
    ? '困难：题目约 6 句，可以使用长句、复句、省略、呼应和较复杂的修饰结构，但必须保持自然、连贯、可理解；不要为了增加难度而生硬堆砌表达。'
    : '普通：题目约 4 句，难度接近当前教材范围，表达自然清楚。'
  const grammarLines = grammar.map((item, index) => [
    `${index + 1}. ID=${item.id}`,
    `文法=${clean(item.grammar)}`,
    `接续=${clean(item.formation)}`,
    `意义=${clean(item.meaning)}`,
    `译文=${clean(item.translation)}`,
    `短解释=${clean(item.brief_logic)}`
  ].join('；')).join('\n')
  const vocabularyLines = vocabulary.slice(0, 6).map((item, index) => (
    `${index + 1}. ${clean(item.term)} ${clean(item.supplement)}：${clean(item.explanation)}`
  )).join('\n')

  return [
    {
      role: 'system',
      content: `
你是一名专业的日语翻译练习出题教师，面向中文母语者。
不要输出思考过程。你必须只输出一个 JSON 对象，不要输出 markdown，不要解释 JSON 以外的内容。
JSON 顶层必须包含 items 数组，items 数组必须恰好 1 个对象。
题目要有文学性但清楚。可以参考现实文学作品的主题、场景、叙述氛围或经典片段进行改编，但不得直接复现原文；如果参考了具体作品，请把出处放进 title 的括号中。
文本必须流畅通顺、语义完整，不能为了硬用文法或词汇导致难以理解。能力标签是上限，不要故意顶格出难题。
`.trim()
    },
    {
      role: 'user',
      content: `
请生成一次翻译练习。

【教材范围】
- 教材：${range.textbookName}
- 范围：${range.rangeLabel}（第${range.lessonMin}-${range.lessonMax}课）
- 难度上限：${range.abilityLabel}
- 练习难度：${difficultyLabel(difficulty)}
- 当前用户年级：${userGrade}
- 年级提示：${gradeHint}

【本次必须使用的目标文法】
${grammarLines}

【本范围已录入词汇参考】
${vocabularyLines || '-'}

【生成要求】
1. 只生成 1 道${directionLabel(direction)}题。
2. ${lengthRequirement}
3. 题目可以有文学性，但首先要自然、顺畅、清楚；避免纯口语闲聊，也不要为了使用目标文法或词汇而牺牲可读性。
4. 如果是汉译日题，必须列出“本题目标文法”，只写文法和接续，不写中文意思。
5. 这一题必须尽量自然覆盖全部目标文法；不要机械堆叠。
6. 鼓励参考现实文学作品进行改编或仿写氛围，但不得直接复现原文；如参考了具体作品，把“参考：作者《作品名》”写进 title 的括号中，不要新增字段。
7. 如果使用明显超出所选范围或难度上限的词汇/表达，在 advanced_notes 标注词、读音/说明、中文释义、为什么需要注明。这个判断只作学习提示，不必追求绝对完整。
8. 已录入词汇只是帮助控制教材氛围的轻量参考，不是覆盖目标；最多自然吸收少量词汇，不要让题目满篇都是词汇表中的词，也不要为了用词牺牲表达。

【必须严格输出以下 JSON 形状，不能省略 items】
{
  "title": "练习标题",
  "source_mode": "original",
  "literary_style_note": "一句话说明文本风格",
  "advanced_notes": [],
  "items": [
    {
      "id": "${isZhToJp ? 'zh_jp' : 'jp_zh'}",
      "direction": "${direction}",
      "prompt_text": "${isZhToJp ? '中文原文' : '日语原文'}",
      "instruction": "${isZhToJp ? '请译成自然日语。' : '请译成自然中文。'}",
      "target_grammar_ids": [1,2],
      "target_grammar": [{"id":1,"grammar":"...","formation":"..."}],
      "reference_translation": "${isZhToJp ? '参考日语译文' : '参考中文译文'}"
    }
  ]
}
`.trim()
    }
  ]
}

function reviewPrompt({ practice, answers }) {
  return [
    {
      role: 'system',
      content: `
你是一名专业的日语翻译批改教师，面向中文母语者。
你必须只输出一个 JSON 对象，不要输出 markdown。
评分和评价主要依据“原文”和“用户译文”的对应关系，重点看信息准确性、语义完整性、表达自然度、语气处理和目标文法处理。
必须着重检查目标文法在译文中的处理是否准确，包括文法意义、语气、逻辑关系、范围限制和接续对应的翻译是否被正确传达。
所有评分维度都使用 60-100 分，不给低于 60 的分数；总分必须是各维度分数的平均值四舍五入。
参考译文只能作为参考，不是唯一标准；不要因为用户译文与参考译文措辞不同就扣分。
评价要具体、可操作。严重语法错误、误译、核心用词错误标为 serious；自然度、轻微搭配、标点、表达更优建议标为 minor。
标注问题时必须指出具体错误点：如果是词汇误译，说明原文对应词的准确意思；如果是文法误译，说明该文法在此处表达的准确语义关系。
明显属于单个普通词的错看、错打、同形/近形 typo，且不影响句子核心逻辑时，可以标为 minor；但目标文法、助词、时态、否定、条件、让步、因果等文法层面的漏打误打不能因此降级。
不要在输出中提及用户年级、身份、等级或学习阶段。
`.trim()
    },
    {
      role: 'user',
      content: `
请批改以下翻译练习。

【教材范围】
- 教材：${practice.textbook_name}
- 范围：${practice.range_label}
- 难度上限：${practice.ability_label}

【目标文法】
${practice.grammar.map((item, index) => `${index + 1}. ID=${item.id} ${item.grammar}；接续=${clean(item.formation)}；意义=${clean(item.meaning)}`).join('\n')}

【题目】
${practice.exercise.items.map((item, index) => `
${index + 1}. ${item.direction === 'jp_to_zh' ? '日译汉' : '汉译日'}（${item.id}）
原文：${item.prompt_text}
目标文法：${(item.target_grammar || []).map((g) => `${g.grammar}（${g.formation || '-'}）`).join('、') || '-'}
参考译文：${item.reference_translation}
用户译文：${answers[item.id] || ''}
`.trim()).join('\n\n')}

【批改准则】
1. 以原文语义和用户译文为主要比较对象，判断是否准确传达信息、逻辑、语气和修饰关系。
2. 参考译文只帮助理解原文，不作为唯一答案；可接受自然且准确的不同译法。
3. 评分维度中的“自然度”应关注中文/日文目标语表达是否自然，不要求特别文学化。
4. 重点检查目标文法是否被准确翻译：如果目标文法表达的让步、因果、条件、限定、程度、时间顺序、说话人态度等没有被译出，应明确指出。
5. 每个维度最低 60 分、最高 100 分；score 填写所有维度分数的平均值，四舍五入为整数。
6. issues[].quote 应尽量截取用户译文中最具体的问题片段，不要过长；issues[].explanation 必须包含“原文对应词/文法的准确意思”和“用户译文为什么不对应”。例如遇到「あくまで自分一人で生きていけると思っていた」被译错时，必须说明「あくまで」在此处是“始终、坚持到底、彻底地”的意思，而不是只说整句语义相反。
7. 明显属于普通词错看或输入 typo 的问题可标为 minor，例如把“庭”看成无关词导致的单词层面错误；但文法、助词、否定、条件、让步、因果、时态等会改变逻辑关系的漏打误打必须按实际严重性标注，不能简单当作 typo。
8. 不要输出任何针对用户年级、身份、等级的信息。

【JSON Schema】
{
  "score": 0,
  "summary": "总体评价",
  "dimensions": [
    {"label":"准确性","score":0,"comment":"..."},
    {"label":"自然度","score":0,"comment":"..."},
    {"label":"语法","score":0,"comment":"..."},
    {"label":"用词","score":0,"comment":"..."}
  ],
  "corrected_answers": [
    {"item_id":"jp_zh","user_answer":"...","reference_answer":"...","revised_answer":"建议译文","comment":"..."}
  ],
  "issues": [
    {"item_id":"zh_jp","severity":"serious","category":"语法","quote":"用户译文中的具体问题片段","explanation":"指出原文对应词/文法的准确意思，并说明用户译文为什么不对应","suggestion":"修改建议"},
    {"item_id":"jp_zh","severity":"minor","category":"typo/用词/自然度/语法","quote":"...","explanation":"...","suggestion":"..."}
  ],
  "grammar_focus": [
    {"grammar":"...","ok":true,"comment":"目标文法使用情况"}
  ],
  "next_steps": ["下一步建议"]
}

score 和 dimensions[].score 使用 60-100 的整数；score 必须等于 dimensions[].score 的平均值。
`.trim()
    }
  ]
}

function chatPrompt({ practice, messages, question, user }) {
  const history = messages.slice(-12).map((message) => `${message.role === 'assistant' ? 'AI' : '用户'}：${message.content}`).join('\n')
  const userGrade = clean(user?.grade)
  const gradeHint = STUDENT_GRADE_HINTS[userGrade] || '按普通中文母语日语学习者解释'
  return [
    {
      role: 'system',
      content: `
你是一名日语翻译练习教师。用户正在围绕一次已经完成或正在进行的翻译练习追问。
回答要优先依据题目、用户译文和批改结果，不要打开新话题。可以补充例句，但保持聚焦。
参考用户学习阶段来调整解释深浅，但不要在回答中提及用户年级、身份、等级或“根据你的水平”等表述。
回答要像专业、耐心、细致的日语学习助手：说明中日表达习惯差异、用法、语气、自然度、限制和常见误区；简单问题简洁回答，复杂问题结构化说明。
`.trim()
    },
    {
      role: 'user',
      content: `
【练习上下文】
- 教材：${practice.textbook_name}
- 范围：${practice.range_label}
- 难度上限：${practice.ability_label}
- 题目：${practice.exercise.title || practice.exercise.literary_style_note || '-'}
- 内部学习阶段参考：${gradeHint}

【目标文法】
${practice.grammar.map((item, index) => `${index + 1}. ${item.grammar}：${clean(item.meaning)}；接续=${clean(item.formation)}`).join('\n')}

【题目与参考译文】
${(practice.exercise.items || []).map((item) => `${item.id} ${item.direction}：${item.prompt_text}\n参考：${item.reference_translation}`).join('\n\n')}

【用户答案】
${practice.answer ? Object.entries(practice.answer).map(([key, value]) => `${key}：${value}`).join('\n') : '-'}

【批改结果】
${practice.review ? JSON.stringify(practice.review, null, 2) : '-'}

【最近追问历史】
${history || '-'}

【用户新问题】
${question}
`.trim()
    }
  ]
}

function normalizeGeneratedExercise(parsed, grammar, directionMode = 'jp_to_zh', difficultyMode = 'normal') {
  const items = Array.isArray(parsed.items) ? parsed.items : []
  if (items.length < 1) {
    throw new Error('AI 返回的题目数量不足')
  }
  const knownGrammarIds = new Set(grammar.map((item) => Number(item.id)))
  const requestedDirection = normalizeDirectionMode(directionMode)
  return {
    title: clean(parsed.title) === '-' ? '文学翻译练习' : String(parsed.title).trim(),
    difficulty_mode: normalizeDifficultyMode(difficultyMode),
    difficulty_label: difficultyLabel(normalizeDifficultyMode(difficultyMode)),
    source_mode: parsed.source_mode === 'public_domain_inspired' ? 'public_domain_inspired' : 'original',
    literary_style_note: String(parsed.literary_style_note || '').trim(),
    advanced_notes: Array.isArray(parsed.advanced_notes) ? parsed.advanced_notes : [],
    items: items.slice(0, 1).map((item) => {
      const direction = item.direction === 'zh_to_jp' || item.direction === 'jp_to_zh'
        ? item.direction
        : requestedDirection
      const id = direction === 'zh_to_jp' ? 'zh_jp' : 'jp_zh'
      const targetGrammar = Array.isArray(item.target_grammar) ? item.target_grammar : []
      const targetIds = (Array.isArray(item.target_grammar_ids) ? item.target_grammar_ids : targetGrammar.map((g) => g.id))
        .map(Number)
        .filter((idValue) => knownGrammarIds.has(idValue))
      return {
        id,
        direction,
        prompt_text: String(item.prompt_text || '').trim(),
        instruction: String(item.instruction || (direction === 'zh_to_jp' ? '请译成自然日语。' : '请译成自然中文。')).trim(),
        target_grammar_ids: targetIds,
        target_grammar: targetGrammar.map((g) => ({
          id: Number(g.id || 0),
          grammar: String(g.grammar || '').trim(),
          formation: String(g.formation || '').trim()
        })).filter((g) => g.grammar),
        reference_translation: String(item.reference_translation || '').trim()
      }
    }).filter((item) => item.prompt_text && item.reference_translation)
  }
}

function normalizeReview(parsed) {
  const dimensions = Array.isArray(parsed.dimensions)
    ? parsed.dimensions.map((item) => ({
      ...item,
      score: Math.max(60, Math.min(100, Math.round(Number(item?.score || 60))))
    }))
    : []
  const averagedScore = dimensions.length
    ? Math.round(dimensions.reduce((sum, item) => sum + Number(item.score || 60), 0) / dimensions.length)
    : Math.max(60, Math.min(100, Math.round(Number(parsed.score || 60))))

  return {
    score: averagedScore,
    summary: String(parsed.summary || '').trim(),
    dimensions,
    corrected_answers: Array.isArray(parsed.corrected_answers) ? parsed.corrected_answers : [],
    issues: Array.isArray(parsed.issues)
      ? parsed.issues.map((item) => ({
        ...item,
        severity: item.severity === 'serious' ? 'serious' : 'minor'
      }))
      : [],
    grammar_focus: Array.isArray(parsed.grammar_focus) ? parsed.grammar_focus : [],
    next_steps: Array.isArray(parsed.next_steps) ? parsed.next_steps : []
  }
}

async function generatePractice({ userId, rangeKey, directionMode, difficultyMode }) {
  const user = User.findById(userId)
  const range = resolveRange(rangeKey)
  const normalizedDirectionMode = normalizeDirectionMode(directionMode)
  const normalizedDifficultyMode = normalizeDifficultyMode(difficultyMode)
  const allGrammar = grammarForRange(range)
  if (allGrammar.length < 3) {
    const error = new Error('当前范围内文法数量不足，暂不能出题')
    error.status = 400
    throw error
  }
  const grammar = pickItems(allGrammar, 3)
  const vocabulary = vocabularyForRange(range)
  const vocabularySample = pickItems(vocabulary, Math.min(12, vocabulary.length))
  const textSamples = textSamplesForRange(range)

  const raw = await completeChat({
    messages: generationPrompt({
      range,
      user,
      grammar,
      vocabulary: vocabularySample,
      textSamples,
      directionMode: normalizedDirectionMode,
      difficultyMode: normalizedDifficultyMode
    }),
    enableSearch: false,
    forcedSearch: false,
    maxTokens: 10000,
    timeoutMs: 180000
  })

  let parsed
  try {
    parsed = extractJson(raw)
  } catch (error) {
    error.message = `${error.message}：${String(raw || '').slice(0, 240)}`
    throw error
  }

  let exercise
  try {
    exercise = normalizeGeneratedExercise(parsed, grammar, normalizedDirectionMode, normalizedDifficultyMode)
  } catch (error) {
    error.message = `${error.message}：${JSON.stringify(parsed).slice(0, 240)}`
    throw error
  }

  return TranslationPractice.create({
    userId,
    ...range,
    status: 'draft',
    grammar,
    vocabulary: vocabularySample,
    exercise
  })
}

async function submitPractice({ userId, practiceId, answers }) {
  const practice = TranslationPractice.findOwnedById(practiceId, userId)
  if (!practice) {
    const error = new Error('练习记录不存在')
    error.status = 404
    throw error
  }
  const normalizedAnswers = {}
  for (const item of practice.exercise.items || []) {
    normalizedAnswers[item.id] = String(answers?.[item.id] || '').trim()
  }
  if (!Object.values(normalizedAnswers).some(Boolean)) {
    const error = new Error('请先填写翻译答案')
    error.status = 400
    throw error
  }

  const raw = await completeChat({
    messages: reviewPrompt({ practice, answers: normalizedAnswers }),
    enableSearch: false,
    forcedSearch: false,
    maxTokens: 6000,
    timeoutMs: 180000
  })
  let review
  try {
    review = normalizeReview(extractJson(raw))
  } catch (error) {
    error.message = `${error.message}：${String(raw || '').slice(0, 240)}`
    throw error
  }
  return TranslationPractice.saveReview(practiceId, userId, {
    answer: normalizedAnswers,
    review
  })
}

async function savePracticeAnswers({ userId, practiceId, answers }) {
  const practice = TranslationPractice.findOwnedById(practiceId, userId)
  if (!practice) {
    const error = new Error('练习记录不存在')
    error.status = 404
    throw error
  }
  if (practice.status === 'reviewed') {
    const error = new Error('已批改的练习不能修改答案')
    error.status = 400
    throw error
  }

  const normalizedAnswers = {}
  for (const item of practice.exercise.items || []) {
    normalizedAnswers[item.id] = String(answers?.[item.id] || '').trim()
  }

  return TranslationPractice.saveAnswers(practiceId, userId, {
    answer: normalizedAnswers
  })
}

async function askPractice({ userId, practiceId, content }) {
  const practice = TranslationPractice.findOwnedById(practiceId, userId, { includeMessages: true })
  if (!practice) {
    const error = new Error('练习记录不存在')
    error.status = 404
    throw error
  }
  const question = String(content || '').trim()
  if (!question) {
    const error = new Error('请输入问题')
    error.status = 400
    throw error
  }
  if (question.length > 1000) {
    const error = new Error('问题内容不能超过 1000 字')
    error.status = 400
    throw error
  }
  const user = User.findById(userId)
  TranslationPractice.addMessage({
    practiceId,
    userId,
    role: 'user',
    content: question
  })
  const messages = TranslationPractice.messages(practiceId, userId)
  const answer = await completeChat({
    messages: chatPrompt({ practice, messages, question, user }),
    enableSearch: false,
    forcedSearch: false,
    maxTokens: 2500,
    timeoutMs: 120000
  })
  const assistantMessage = TranslationPractice.addMessage({
    practiceId,
    userId,
    role: 'assistant',
    content: answer || '（AI 服务未返回内容）'
  })

  return {
    message: assistantMessage,
    messages: TranslationPractice.messages(practiceId, userId)
  }
}

module.exports = {
  askPractice,
  generatePractice,
  listRangeOptions,
  savePracticeAnswers,
  submitPractice
}
