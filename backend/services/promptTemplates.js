const COMMON_SYSTEM_PROMPT = `
你是一名专业、耐心、细致的 AI 日语学习助手，面向中文母语者学习日语。

你的日文名字是あーちゃん，中文名字是阿酱。无论用户提问什么问题，都要以教学和帮助学习为目的，给出最有用、最准确、最自然的回答。

你的主要任务是解释日语单词、表达、文法、文章结构和翻译问题。回答时要注意中日表达习惯差异，不只给中文意思，也要说明用法、语气、自然度、限制和常见误区。

回答原则：
- 简单事实问题要简洁，不要强行展开成长篇。
- 复杂比较、用法差异、翻译评价、文章讲解要结构化说明。
- 可以使用自然日语例句，但必须配中文解释。
- 如果需要上下文才能判断，要明确说明，不要强行给唯一答案。
- 如果用户表达不自然，要指出问题并给出更自然表达。
- 联网搜索时，要明确哪些内容来自搜索结果。
`.trim()

const TASK_PROMPTS = {
  general_qa: '现在请你执行【日语学习自由问答】任务。根据用户问题选择合适深度回答。',
  vocabulary_explain: `
现在请你执行【单词・表达解释】任务。
优先依据当前词条上下文回答。需要说明读音、词性、教材当前释义、自然用法、语气、搭配和常见错误。除非用户要求详细展开，否则保持回答紧凑。
`.trim(),
  vocabulary_examples: `
现在请你执行【单词例句生成】任务。
请严格围绕当前教材释义生成自然例句，不要偏到其他义项。每个例句都要有中文翻译和一句简短说明。
`.trim(),
  vocabulary_other_meanings: `
现在请你执行【单词其他释义说明】任务。
请先区分“当前教材义项”和“常见其他义项”。如果其他义项不确定，要说明需要查词典或上下文确认。
`.trim(),
  vocabulary_web_search: `
现在请你执行【联网百科/背景说明】任务。
请结合联网搜索介绍该专有名词，优先给出可靠且中国大陆较容易访问的来源链接。不要把未经确认的信息说成事实。
`.trim(),
  vocabulary_kanji_readings: `
现在请你执行【汉字读音说明】任务。
请围绕当前词条中的汉字，说明可能的音读、训读、常见词例和与当前词条读音的关系。
`.trim(),
  grammar_explain: `
现在请你执行【文法解释】任务。
优先依据当前文法上下文回答。需要说明接续、基本意义、使用场景、语气特点、注意事项和容易混淆的地方。
`.trim(),
  grammar_examples: `
现在请你执行【文法例句生成】任务。
请严格围绕当前文法的当前用法生成自然例句，每个例句都要有中文翻译和用法说明。
`.trim(),
  grammar_other_usages: `
现在请你执行【文法其他用法说明】任务。
请先说明当前教材中的用法，再说明可能存在的其他用法或相近表达，并区分适用场景。
`.trim(),
  translation_review: '现在请你执行【翻译评价与纠错】任务。评价准确性、自然度、语法、语气风格和信息完整性。',
  article_explain: '现在请你执行【日语文章精读讲解】任务。文章提问入口暂未开放；如用户提供文章，请按段落和重点句讲解。'
}

function clean(value) {
  const text = String(value ?? '').trim()
  return text || '-'
}

function boolLabel(value) {
  return value ? '是' : '否'
}

function formatVocabularyContext(snapshot = {}) {
  return `
【当前单词上下文】
- 词条：${clean(snapshot.term)}
- 补充/读音：${clean(snapshot.supplement)}
- 声调：${clean(snapshot.accent)}
- 词性：${clean(snapshot.part_of_speech)}
- 当前释义：${clean(snapshot.explanation)}
`.trim()
}

function formatGrammarContext(snapshot = {}) {
  const examples = Array.isArray(snapshot.examples) && snapshot.examples.length
    ? snapshot.examples.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '-'

  return `
【当前文法上下文】
- 文法：${clean(snapshot.grammar)}
- 简要逻辑：${clean(snapshot.brief_logic)}
- 意义：${clean(snapshot.meaning)}
- 译文：${clean(snapshot.translation)}
- 接续：${clean(snapshot.formation)}
- 说明：${clean(snapshot.notes)}
- 例句：
${examples}
`.trim()
}

function formatContext(conversation = {}) {
  const snapshot = conversation.context_snapshot || {}
  if (conversation.context_type === 'vocabulary') return formatVocabularyContext(snapshot)
  if (conversation.context_type === 'grammar') return formatGrammarContext(snapshot)
  return '【当前上下文】无特定条目。'
}

function buildMessages({ conversation, messages, templateKey }) {
  const taskPrompt = TASK_PROMPTS[templateKey] || TASK_PROMPTS[conversation.template_key] || TASK_PROMPTS.general_qa
  const systemContent = [COMMON_SYSTEM_PROMPT, taskPrompt, formatContext(conversation)].join('\n\n')
  const recentMessages = messages.slice(-24).map((item) => ({
    role: item.role === 'assistant' ? 'assistant' : 'user',
    content: String(item.content || '')
  }))

  return [
    { role: 'system', content: systemContent },
    ...recentMessages
  ]
}

function shouldEnableSearch({ question = '', templateKey = '', forceWebSearch = false }) {
  if (forceWebSearch || templateKey === 'vocabulary_web_search') return { enableSearch: true, forcedSearch: true }
  const text = String(question || '')
  const needsSearch = /(联网|搜索|查一下|最新|新闻|是谁|是什么人|什么是|背景|来源|出处|官网|现在|今天|近期|价格|天气)/.test(text)
  return { enableSearch: needsSearch, forcedSearch: false }
}

function suggestedQuestions(conversation = {}) {
  const snapshot = conversation.context_snapshot || {}
  if (conversation.context_type === 'vocabulary') {
    const term = clean(snapshot.term)
    const questions = [
      {
        key: 'vocabulary_examples',
        label: '可以给出一些例句吗？',
        message: '可以给出这个单词的一些例句吗？',
        template_key: 'vocabulary_examples'
      },
      {
        key: 'vocabulary_other_meanings',
        label: '这个单词有没有其他释义？',
        message: '这个单词有没有其他释义？',
        template_key: 'vocabulary_other_meanings'
      }
    ]

    if (snapshot.is_proper_noun) {
      questions.push({
        key: 'vocabulary_web_search',
        label: `联网搜索「${term}」`,
        message: `请联网搜索并介绍「${term}」。`,
        template_key: 'vocabulary_web_search',
        force_web_search: true
      })
    }

    if (snapshot.has_kanji) {
      questions.push({
        key: 'vocabulary_kanji_readings',
        label: '讲讲汉字的其他读音',
        message: '请讲讲这个词条中汉字的其他常见读音和相关词例。',
        template_key: 'vocabulary_kanji_readings'
      })
    }

    return questions
  }

  if (conversation.context_type === 'grammar') {
    return [
      {
        key: 'grammar_examples',
        label: '可以给出一些新的例句吗？',
        message: '可以给出一些这个用法的例句吗？',
        template_key: 'grammar_examples'
      },
      {
        key: 'grammar_other_usages',
        label: '这个文法有没有其他用法？',
        message: '这个文法还有没有其他用法？',
        template_key: 'grammar_other_usages'
      }
    ]
  }

  return []
}

module.exports = {
  buildMessages,
  shouldEnableSearch,
  suggestedQuestions
}
