const { Text } = require('../models/Text')
const { TextClozePractice } = require('../models/TextClozePractice')
const { User } = require('../models/User')
const { completeChat } = require('./aiProvider')

const TARGET_QUESTION_COUNT = 15
const OPTION_KEYS = ['A', 'B', 'C', 'D']
const generationJobs = new Map()

const STUDENT_GRADE_HINTS = {
  大一上: '通常接近综合日语第一册上半或N5起步阶段',
  大一下: '通常接近综合日语第一册下半到第二册上半',
  大二上: '通常接近综合日语第二册下半到第三册上半',
  大二下: '通常接近综合日语第三册下半到第四册上半',
  高年级: '可按N1上限处理，但题目仍应根据当前课文控制难度',
  教师: '教师视角，可展示完整判断'
}

function clean(value) {
  const text = String(value ?? '').trim()
  return text || '-'
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

function normalizeMarkerText(value) {
  return String(value || '').trim()
}

function normalizeVocabularyMarkerText(value) {
  return normalizeMarkerText(value)
    .replace(/[▽▼]/g, '')
    .replace(/[‐‑‒–—―－]/g, '-')
    .replace(/\s+/g, '')
}

function vocabularyPatterns(item) {
  const raw = normalizeMarkerText(item?.term)
  if (!raw) return []
  const candidates = new Map()

  raw
    .split(/[／/、，]/)
    .map((part) => normalizeVocabularyMarkerText(part))
    .forEach((part) => {
      if (!part) return
      const startsAsSuffix = part.startsWith('-')
      const endsAsPrefix = part.endsWith('-')
      const text = part.replace(/^-+/, '').replace(/-+$/, '')
      if (!text) return
      const kind = startsAsSuffix ? 'suffix' : endsAsPrefix ? 'prefix' : 'term'
      if (!candidates.has(text)) candidates.set(text, { text, kind })
    })

  return Array.from(candidates.values())
}

function stripGrammarSlot(value) {
  return normalizeMarkerText(value)
    .replace(/[〜~]/g, '')
    .replace(/[（）()]/g, '')
    .replace(/[ＮＶＡ]/g, (char) => ({ 'Ｎ': 'N', 'Ｖ': 'V', 'Ａ': 'A' }[char]))
    .replace(/[NVA][0-9０-９]*/g, '')
    .trim()
}

function grammarPatterns(item) {
  const raw = normalizeMarkerText(item?.grammar)
  if (!raw) return []
  const candidates = new Set()

  raw
    .split(/[／/]/)
    .map((part) => stripGrammarSlot(part))
    .forEach((part) => {
      if (!part) return
      part.split(/[、，]/).forEach((piece) => {
        const text = stripGrammarSlot(piece)
        if (Array.from(text).length >= 2) candidates.add(text)
      })
    })

  const compact = stripGrammarSlot(raw)
  if (Array.from(compact).length >= 2 && !/[、，／/]/.test(compact)) candidates.add(compact)
  return Array.from(candidates).map((text) => ({ text, kind: 'grammar' }))
}

function charBefore(text, index) {
  if (index <= 0) return ''
  return text[index - 1] || ''
}

function charAfter(text, index, markerText) {
  return text[index + markerText.length] || ''
}

function isJapaneseWordChar(char) {
  return !!char && /[\u3040-\u30ff\u3400-\u9fff々〆ヶーA-Za-z0-9]/u.test(char)
}

function isKana(char) {
  return !!char && /[\u3040-\u30ffー]/u.test(char)
}

function isKatakana(char) {
  return !!char && /[\u30a0-\u30ffー]/u.test(char)
}

function isKanji(char) {
  return !!char && /[\u3400-\u9fff々〆ヶ]/u.test(char)
}

function isPunctuationBoundary(char) {
  return !char || /[\s、。，．,.!?！？;；:：「」『』（）()［］\[\]【】〈〉《》〔〕…・\n\r\t]/u.test(char)
}

function isParticleBoundary(char) {
  return !!char && /[はがをにへでとのもやかねよぞなさわ]/u.test(char)
}

function isHonorificStart(text, index) {
  return ['さん', 'ちゃん', 'くん', '君', '氏', '先生'].some((suffix) => text.startsWith(suffix, index))
}

function isLeftBoundary(char) {
  return !isJapaneseWordChar(char) || isPunctuationBoundary(char) || isParticleBoundary(char)
}

function isInflectionBoundaryStart(text, index) {
  return [
    'だ',
    'だった',
    'です',
    'でした',
    'でし',
    'で',
    'な',
    'に',
    'と',
    'さ',
    'く',
    'かった',
    'けれ',
    'そう',
    'そば',
    'ほど',
    'くらい',
    'ぐらい'
  ].some((suffix) => text.startsWith(suffix, index))
}

function isRightBoundary(text, index, markerText) {
  const next = charAfter(text, index, markerText)
  const nextIndex = index + markerText.length
  return (
    !isJapaneseWordChar(next)
    || isPunctuationBoundary(next)
    || isParticleBoundary(next)
    || isHonorificStart(text, nextIndex)
    || isInflectionBoundaryStart(text, nextIndex)
  )
}

function hasVocabularyContext(text, index, pattern) {
  const prev = charBefore(text, index)
  const next = charAfter(text, index, pattern.text)
  const length = Array.from(pattern.text).length

  if (pattern.kind === 'prefix') {
    return isLeftBoundary(prev) && isJapaneseWordChar(next) && !isPunctuationBoundary(next)
  }

  if (pattern.kind === 'suffix') {
    return isJapaneseWordChar(prev) && isRightBoundary(text, index, pattern.text)
  }

  if (length === 1) {
    const nextIndex = index + pattern.text.length
    const hasStrictLeft = !isJapaneseWordChar(prev) || isPunctuationBoundary(prev)
    const hasStrictRight = !isJapaneseWordChar(next) || isPunctuationBoundary(next) || isParticleBoundary(next) || isHonorificStart(text, nextIndex)
    if (pattern.item?.is_proper_noun) return hasStrictLeft && hasStrictRight
    if (isKanji(pattern.text)) return hasStrictLeft && hasStrictRight
    return hasStrictLeft && (!isJapaneseWordChar(next) || isPunctuationBoundary(next))
  }

  if (!isLeftBoundary(prev)) return false
  if (isKatakana(prev) && isKatakana(pattern.text[0])) return false
  if (isKatakana(next) && isKatakana(pattern.text[pattern.text.length - 1])) return false
  return isRightBoundary(text, index, pattern.text)
}

function hasGrammarContext(text, index, pattern) {
  const prev = charBefore(text, index)
  const next = charAfter(text, index, pattern.text)
  const first = pattern.text[0]
  const last = pattern.text[pattern.text.length - 1]

  if (isKatakana(prev) || isKatakana(next)) return false
  if (/[A-Za-z0-9]/.test(prev) || /[A-Za-z0-9]/.test(next)) return false

  const attachesToPrevious = [
    'は',
    'が',
    'を',
    'に',
    'へ',
    'で',
    'と',
    'の',
    'も',
    'より',
    'から',
    'まで',
    'ば',
    'たら',
    'なら',
    'そば',
    'ほど',
    'くらい',
    'ぐらい'
  ].some((prefix) => pattern.text.startsWith(prefix))
  if (!attachesToPrevious && isJapaneseWordChar(prev) && !isParticleBoundary(prev)) return false
  if (isKana(prev) && isKana(first) && !attachesToPrevious && !isParticleBoundary(prev)) return false
  if (isKanji(next) && isKanji(last)) return false

  return true
}

function matchesPatternAt(text, index, pattern) {
  if (!text.startsWith(pattern.text, index)) return false
  if (pattern.type === 'grammar') return hasGrammarContext(text, index, pattern)
  return hasVocabularyContext(text, index, pattern)
}

function findMatchingPattern(text, patterns, index) {
  return patterns.find((pattern) => matchesPatternAt(text, index, pattern))
}

function buildPatterns(vocabulary, grammar) {
  const seen = new Set()
  const patterns = []

  grammar.forEach((item) => {
    grammarPatterns(item).forEach((pattern) => {
      const key = `grammar:${pattern.text}`
      if (seen.has(key)) return
      seen.add(key)
      patterns.push({ type: 'grammar', ...pattern, item })
    })
  })

  vocabulary.forEach((item) => {
    vocabularyPatterns(item).forEach((pattern) => {
      const key = `vocabulary:${pattern.text}`
      if (seen.has(key)) return
      seen.add(key)
      patterns.push({ type: 'vocabulary', ...pattern, item })
    })
  })

  return patterns.sort((a, b) => {
    const lengthDelta = Array.from(b.text).length - Array.from(a.text).length
    if (lengthDelta) return lengthDelta
    if (a.type !== b.type) return a.type === 'grammar' ? -1 : 1
    return Number(a.item.id) - Number(b.item.id)
  })
}

function contextAround(text, start, end, size = 34) {
  const left = Math.max(0, start - size)
  const right = Math.min(text.length, end + size)
  return `${text.slice(left, start)}【${text.slice(start, end)}】${text.slice(end, right)}`
    .replace(/\s+/g, ' ')
    .trim()
}

function collectAppearingMarkers(study) {
  const text = String(study?.item?.content || '')
  const patterns = buildPatterns(study?.vocabulary || [], study?.grammar || [])
  const candidates = []
  const vocabularyMap = new Map()
  const grammarMap = new Map()
  let index = 0

  while (index < text.length) {
    const match = findMatchingPattern(text, patterns, index)
    if (!match) {
      index += 1
      continue
    }

    const start = index
    const end = index + match.text.length
    index = end

    if (match.type === 'vocabulary' && match.item?.is_proper_noun) continue

    const id = `c${candidates.length + 1}`
    const base = {
      id,
      type: match.type,
      text: match.text,
      start_offset: start,
      end_offset: end,
      context: contextAround(text, start, end)
    }

    if (match.type === 'grammar') {
      grammarMap.set(Number(match.item.id), {
        id: match.item.id,
        grammar: match.item.grammar,
        brief_logic: match.item.brief_logic,
        meaning: match.item.meaning,
        translation: match.item.translation,
        formation: match.item.formation
      })
      candidates.push({
        ...base,
        grammar_id: match.item.id,
        label: match.item.grammar,
        meaning: match.item.meaning || match.item.translation || match.item.brief_logic || ''
      })
      continue
    }

    vocabularyMap.set(Number(match.item.id), {
      id: match.item.id,
      term: match.item.term,
      supplement: match.item.supplement,
      part_of_speech: match.item.part_of_speech,
      explanation: match.item.explanation,
      is_key_word: !!match.item.is_key_word
    })
    candidates.push({
      ...base,
      vocabulary_id: match.item.id,
      label: match.item.term,
      meaning: match.item.explanation || match.item.supplement || ''
    })
  }

  return {
    text,
    candidates,
    vocabulary: Array.from(vocabularyMap.values()),
    grammar: Array.from(grammarMap.values())
  }
}

function generationPrompt({ study, markers, user }) {
  const item = study.item
  const userGrade = clean(user?.grade)
  const gradeHint = STUDENT_GRADE_HINTS[userGrade] || '未提供年级，按当前课文控制'
  const candidateLines = markers.candidates.slice(0, 120).map((candidate) => {
    const label = candidate.type === 'grammar' ? `文法=${clean(candidate.label)}` : `单词=${clean(candidate.label)}`
    return [
      `${candidate.id}.`,
      `类型=${candidate.type === 'grammar' ? '文法' : '词汇'}`,
      `原文片段=${clean(candidate.text)}`,
      label,
      `含义=${clean(candidate.meaning)}`,
      `上下文=${clean(candidate.context)}`
    ].join(' ')
  }).join('\n')

  return [
    {
      role: 'system',
      content: `
你是一名专业的日语课文理解练习出题教师，面向中文母语者。
你必须只输出一个 JSON 对象，不要输出 markdown，不要解释 JSON 以外的内容。
你要根据课文上下文设计完形填空题，重点考查课文理解、关键词、重要副词、逻辑关联词、呼应表达和文法现象。
题目必须能从上下文推出唯一答案，不能靠孤立背词或硬猜。避免挖专有名词、人名、地名、语气词、过于机械的助词或没有理解价值的片段。
`.trim()
    },
    {
      role: 'user',
      content: `
请基于以下课文生成完形填空题。

【课文信息】
- 教材：${item.textbook_name}
- 第${item.lesson_number}课 / 第${item.unit_number}单元
- 标题：${item.title}
- 当前用户年级：${userGrade}
- 年级提示：${gradeHint}

【课文全文】
${markers.text}

【本课重点词汇语法】
${candidateLines || '-'}

【出题要求】
1. 目标生成 ${TARGET_QUESTION_COUNT} 题；如果课文本身高质量候选不足，可以少于 ${TARGET_QUESTION_COUNT} 题，但不要为了凑数选择低价值片段。
2. 每道题只能选择一个 candidate_id；不支持非连续挖空。较长但连续的固定表达可以整体挖空。
3. 挖空对象要优先选择对理解上下文有意义的关键词、重要副词、逻辑关联词、重要文法现象、句间逻辑表达、拟声拟态词等。
4. 选项必须是日语原文形式，A/B/C/D 四个选项必须互不相同，且只有一个正确答案。
5. 错误选项可以用常见的语法误用等作为错误选项，但是不能用太过细微的语气差异，要保证错误选项在当前上下文中不成立，不能成为正确答案。
6. 不需要解析，不要输出答案解释。
7. 避免挖专有名词、人名、地名、语气词、过于机械的助词或没有理解价值的片段。
8. 本课重点词汇语法仅作参考，不要局限于这些候选，积极在上下文中挖掘其他有价值的片段，没有价值的词汇也不要挖空。
9. candidate_id 必须来自上面的候选列表；answer 必须等于该候选的原文片段。

【必须严格输出以下 JSON 形状】
{
  "title": "完形填空",
  "questions": [
    {
      "candidate_id": "c1",
      "answer": "原文中被挖空的连续片段",
      "options": [
        {"key":"A","text":"..."},
        {"key":"B","text":"..."},
        {"key":"C","text":"..."},
        {"key":"D","text":"..."}
      ]
    }
  ]
}
`.trim()
    }
  ]
}

function normalizeOptionText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeGeneratedQuestions(parsed, candidates) {
  const candidateMap = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const usedCandidates = new Set()
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : []
  const normalized = []

  for (const rawQuestion of rawQuestions) {
    const candidateId = String(rawQuestion?.candidate_id || rawQuestion?.candidateId || '').trim()
    const candidate = candidateMap.get(candidateId)
    if (!candidate || usedCandidates.has(candidateId)) continue

    const optionTexts = []
    const rawOptions = Array.isArray(rawQuestion.options) ? rawQuestion.options : []
    rawOptions.forEach((option) => {
      const text = normalizeOptionText(typeof option === 'string' ? option : option?.text)
      if (text && !optionTexts.includes(text)) optionTexts.push(text)
    })

    const answer = candidate.text
    const baseOptionTexts = optionTexts.includes(answer)
      ? [answer, ...optionTexts.filter((text) => text !== answer)].slice(0, 4)
      : [answer, ...optionTexts].slice(0, 4)
    if (baseOptionTexts.length < 4) continue
    const rotateBy = (Number(candidate.start_offset || 0) + Number(candidate.end_offset || 0)) % baseOptionTexts.length
    const orderedOptionTexts = baseOptionTexts.map((_, index) => baseOptionTexts[(index + rotateBy) % baseOptionTexts.length])

    const options = orderedOptionTexts.map((text, index) => ({
      key: OPTION_KEYS[index],
      text
    }))
    let correctIndex = options.findIndex((option) => option.text === answer)
    if (correctIndex < 0) {
      options[0] = { key: 'A', text: answer }
      correctIndex = 0
    }

    usedCandidates.add(candidateId)
    normalized.push({
      id: `q${normalized.length + 1}`,
      number: normalized.length + 1,
      candidate_id: candidateId,
      source_type: candidate.type,
      source_id: candidate.grammar_id || candidate.vocabulary_id || null,
      start_offset: candidate.start_offset,
      end_offset: candidate.end_offset,
      original_text: answer,
      options,
      correct_key: options[correctIndex].key
    })
  }

  return normalized
    .sort((a, b) => a.start_offset - b.start_offset || a.end_offset - b.end_offset)
    .slice(0, TARGET_QUESTION_COUNT)
    .map((question, index) => ({
      ...question,
      id: `q${index + 1}`,
      number: index + 1
    }))
}

function publicQuestion(question, { includeAnswer = false } = {}) {
  const publicItem = {
    id: question.id,
    number: question.number,
    start_offset: question.start_offset,
    end_offset: question.end_offset,
    options: question.options
  }
  if (includeAnswer) {
    publicItem.original_text = question.original_text
    publicItem.correct_key = question.correct_key
  }
  return publicItem
}

function publicSet(set, { includeAnswers = false } = {}) {
  if (!set) return null
  return {
    id: set.id,
    text_id: set.text_id,
    textbook_name: set.textbook_name,
    lesson_number: set.lesson_number,
    unit_number: set.unit_number,
    text_title: set.text_title,
    content_snapshot: set.content_snapshot,
    question_count: set.question_count,
    created_at: set.created_at,
    updated_at: set.updated_at,
    questions: (set.questions || []).map((question) => publicQuestion(question, { includeAnswer: includeAnswers }))
  }
}

async function generateSet({ userId, textId }) {
  const study = Text.studyById(textId, userId)
  if (!study) {
    const error = new Error('课文条目不存在')
    error.status = 404
    throw error
  }

  const markers = collectAppearingMarkers(study)
  if (markers.candidates.length < 1) {
    const error = new Error('当前课文可用于出题的高亮词汇或文法不足')
    error.status = 400
    throw error
  }

  const user = User.findById(userId)
  const raw = await completeChat({
    messages: generationPrompt({ study, markers, user }),
    enableSearch: false,
    forcedSearch: false,
    maxTokens: 8000,
    timeoutMs: 180000
  })

  let parsed
  try {
    parsed = extractJson(raw)
  } catch (error) {
    error.message = `${error.message}：${String(raw || '').slice(0, 240)}`
    throw error
  }

  const questions = normalizeGeneratedQuestions(parsed, markers.candidates)
  if (!questions.length) {
    const error = new Error('AI 返回的完形题目不足，请稍后重试')
    error.status = 502
    throw error
  }

  return TextClozePractice.createSet({
    textId: study.item.id,
    textbookName: study.item.textbook_name,
    lessonNumber: study.item.lesson_number,
    unitNumber: study.item.unit_number,
    textTitle: study.item.title,
    contentSnapshot: markers.text,
    questionCount: questions.length,
    vocabulary: markers.vocabulary,
    grammar: markers.grammar,
    questions,
    sourceCandidates: markers.candidates,
    createdBy: userId
  })
}

function generationJobKey({ userId, textId }) {
  return `${Number(userId)}:${Number(textId)}`
}

function pendingGenerationResult(job) {
  return {
    pending: true,
    status: 'generating',
    loadingText: job?.loadingText || '正在准备完形填空...',
    startedAt: job?.startedAt || null
  }
}

function startGenerationJob({ userId, textId }) {
  const key = generationJobKey({ userId, textId })
  const job = {
    userId: Number(userId),
    textId: Number(textId),
    status: 'generating',
    loadingText: '正在准备完形填空...',
    startedAt: new Date().toISOString(),
    item: null,
    error: ''
  }
  generationJobs.set(key, job)
  job.promise = generateSet({ userId, textId })
    .then((item) => {
      job.status = 'completed'
      job.item = item
      job.completedAt = new Date().toISOString()
      setTimeout(() => {
        if (generationJobs.get(key) === job) generationJobs.delete(key)
      }, 5 * 60 * 1000)
      return item
    })
    .catch((error) => {
      job.status = 'failed'
      job.error = error.message || '生成课文练习失败'
      job.failedAt = new Date().toISOString()
      return null
    })
  return job
}

function normalizeExcludeSetIds(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0))]
}

async function startPractice({ userId, textId, excludeSetIds = [] }) {
  const normalizedExcludeSetIds = normalizeExcludeSetIds(excludeSetIds)
  const existing = TextClozePractice.findReusableSet({ textId, userId, excludeSetIds: normalizedExcludeSetIds })
  if (existing) {
    return {
      item: publicSet(existing),
      reused: true,
      submitted: false
    }
  }

  const key = generationJobKey({ userId, textId })
  const existingJob = generationJobs.get(key)
  if (existingJob?.status === 'generating') return pendingGenerationResult(existingJob)
  if (existingJob?.status === 'failed') generationJobs.delete(key)
  return pendingGenerationResult(startGenerationJob({ userId, textId }))
}

function generationStatus({ userId, textId, excludeSetIds = [] }) {
  const normalizedExcludeSetIds = normalizeExcludeSetIds(excludeSetIds)
  const existing = TextClozePractice.findReusableSet({ textId, userId, excludeSetIds: normalizedExcludeSetIds })
  if (existing) {
    return {
      item: publicSet(existing),
      reused: true,
      submitted: false,
      pending: false,
      status: 'completed'
    }
  }

  const job = generationJobs.get(generationJobKey({ userId, textId }))
  if (!job) {
    return {
      pending: false,
      status: 'idle'
    }
  }
  if (job.status === 'generating') return pendingGenerationResult(job)
  if (job.status === 'failed') {
    return {
      pending: false,
      status: 'failed',
      error: job.error || '生成课文练习失败'
    }
  }
  return {
    pending: false,
    status: 'completed',
    item: job.item && !TextClozePractice.hasAttemptForSet({ userId, setId: job.item.id }) ? publicSet(job.item) : null,
    reused: false,
    submitted: false
  }
}

function getSet({ userId, setId }) {
  const item = TextClozePractice.findSetById(setId)
  if (!item) {
    const error = new Error('练习题不存在')
    error.status = 404
    throw error
  }
  const submitted = TextClozePractice.hasAttemptForSet({ userId, setId })
  return {
    item: publicSet(item, { includeAnswers: submitted }),
    submitted
  }
}

function submitPractice({ userId, setId, answers }) {
  const set = TextClozePractice.findSetById(setId)
  if (!set) {
    const error = new Error('练习题不存在')
    error.status = 404
    throw error
  }
  if (TextClozePractice.hasAttemptForSet({ userId, setId })) {
    const error = new Error('这套题已经提交过')
    error.status = 409
    throw error
  }

  const normalizedAnswers = {}
  const items = []
  for (const question of set.questions || []) {
    const key = String(answers?.[question.id] || answers?.[question.number] || '').trim().toUpperCase()
    if (!OPTION_KEYS.includes(key)) {
      const error = new Error('请先完成所有题目')
      error.status = 400
      throw error
    }
    const isCorrect = key === question.correct_key
    normalizedAnswers[question.id] = key
    items.push({
      id: question.id,
      number: question.number,
      selected_key: key,
      correct_key: question.correct_key,
      is_correct: isCorrect
    })
  }

  const result = {
    question_count: items.length,
    correct_count: items.filter((item) => item.is_correct).length,
    items
  }

  const attempt = TextClozePractice.createAttempt({
    userId,
    setId,
    textId: set.text_id,
    answers: normalizedAnswers,
    result
  })

  return {
    item: {
      ...attempt,
      practice_set: publicSet(attempt.practice_set, { includeAnswers: true })
    }
  }
}

function listAttempts({ userId, textId, limit, offset }) {
  const result = TextClozePractice.listAttemptsForText({ userId, textId, limit, offset })
  return {
    ...result,
    rows: result.rows.map((attempt) => ({
      ...attempt,
      practice_set: publicSet(attempt.practice_set, { includeAnswers: true })
    }))
  }
}

function deleteAttempt({ userId, attemptId }) {
  const deleted = TextClozePractice.deleteAttempt({ userId, attemptId })
  if (!deleted) {
    const error = new Error('练习记录不存在')
    error.status = 404
    throw error
  }
  return { success: true }
}

module.exports = {
  deleteAttempt,
  generationStatus,
  getSet,
  listAttempts,
  startPractice,
  submitPractice
}
