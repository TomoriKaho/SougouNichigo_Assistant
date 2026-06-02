const { AssistantConversation } = require('../models/AssistantConversation')
const { Grammar } = require('../models/Grammar')
const { Vocabulary } = require('../models/Vocabulary')
const { completeChat, streamChat } = require('./aiProvider')
const { buildMessages, shouldEnableSearch, suggestedQuestions } = require('./promptTemplates')

function decorateConversation(conversation, currentUserId) {
  if (!conversation) return null
  return {
    ...conversation,
    is_read_only: Number(conversation.user_id) !== Number(currentUserId),
    suggested_questions: suggestedQuestions(conversation)
  }
}

function initialMessageFor(conversation) {
  if (conversation.context_type === 'vocabulary') {
    return `关于单词 **「${conversation.context_label || '这个词'}」**，你想问些什么？`
  }
  if (conversation.context_type === 'grammar') {
    return `关于文法 **「${conversation.context_label || '这个文法'}」**，你想问些什么？`
  }
  if (conversation.context_type === 'text') {
    return `关于文章 **「${conversation.context_label || '这篇文章'}」**，你想问些什么？`
  }
  return '你好呀，我是你的AI日语助手阿酱。你可以向我提问任何日语相关的问题，我会为你详细解释。'
}

function normalizeConversationTitle(title) {
  const text = String(title || '')
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^["'“”‘’《》【】()（）\[\]{}<>]+|["'“”‘’《》【】()（）\[\]{}<>]+$/g, '')
    .trim()

  const chars = Array.from(text)
  return chars.slice(0, 12).join('').trim() || '自由提问'
}

async function buildFreeConversationTitle(question) {
  const prompt = [
    {
      role: 'system',
      content: '请把用户问题总结成一个中文标题。要求：12字以内；尽量简洁；不要标点；不要解释；只输出标题。'
    },
    {
      role: 'user',
      content: String(question || '').trim()
    }
  ]

  try {
    const summary = await completeChat({ messages: prompt, enableSearch: false, forcedSearch: false })
    return normalizeConversationTitle(summary)
  } catch (error) {
    return normalizeConversationTitle(question)
  }
}

function createConversationWithInitialMessage(payload, currentUserId) {
  const conversation = AssistantConversation.create(payload)
  AssistantConversation.addMessage({
    conversationId: conversation.id,
    role: 'assistant',
    content: initialMessageFor(conversation)
  })
  return {
    conversation: decorateConversation(AssistantConversation.findById(conversation.id), currentUserId),
    messages: AssistantConversation.messages(conversation.id)
  }
}

function createFreeConversation(userId) {
  return createConversationWithInitialMessage({
    userId,
    contextType: 'none',
    contextId: null,
    contextLabel: '自由提问',
    contextSnapshot: null,
    templateKey: 'general_qa',
    visibility: 'private'
  }, userId)
}

function createVocabularyConversation(userId, id) {
  const item = Vocabulary.findById(id)
  if (!item) return null
  return createConversationWithInitialMessage({
    userId,
    contextType: 'vocabulary',
    contextId: item.id,
    contextLabel: item.term,
    contextSnapshot: item,
    templateKey: 'vocabulary_explain',
    visibility: 'context_shared'
  }, userId)
}

function createGrammarConversation(userId, id) {
  const item = Grammar.findById(id)
  if (!item) return null
  return createConversationWithInitialMessage({
    userId,
    contextType: 'grammar',
    contextId: item.id,
    contextLabel: item.grammar,
    contextSnapshot: item,
    templateKey: 'grammar_explain',
    visibility: 'context_shared'
  }, userId)
}

function listConversations({ userId, limit, offset }) {
  const result = AssistantConversation.listOwned({ userId, limit, offset })
  return {
    ...result,
    rows: result.rows.map((item) => decorateConversation(item, userId))
  }
}

function listSharedConversations({ userId, contextType, contextId, limit, offset }) {
  const result = AssistantConversation.listSharedByContext({ userId, contextType, contextId, limit, offset })
  return {
    ...result,
    rows: result.rows.map((item) => decorateConversation(item, userId))
  }
}

function getConversation(userId, id) {
  const conversation = AssistantConversation.findVisibleById(id, userId)
  if (!conversation) return null
  return {
    conversation: decorateConversation(conversation, userId),
    messages: AssistantConversation.messages(conversation.id)
  }
}

async function streamAssistantReply({ userId, conversationId, content, templateKey, forceWebSearch, onDelta }) {
  const conversation = AssistantConversation.findOwnedById(conversationId, userId)
  if (!conversation) {
    const visible = AssistantConversation.findVisibleById(conversationId, userId)
    const error = new Error(visible ? '该共享历史只读，不能继续发送消息' : '对话不存在')
    error.status = visible ? 403 : 404
    throw error
  }

  const question = String(content || '').trim()
  if (!question) {
    const error = new Error('请输入问题')
    error.status = 400
    throw error
  }

  const existingMessages = AssistantConversation.messages(conversation.id)
  const isFirstUserQuestion = !existingMessages.some((message) => message.role === 'user')
  const shouldGenerateFreeTitle = conversation.context_type === 'none' && isFirstUserQuestion

  AssistantConversation.addMessage({
    conversationId: conversation.id,
    role: 'user',
    content: question
  })

  const currentMessages = AssistantConversation.messages(conversation.id)
  const resolvedTemplateKey = templateKey || conversation.template_key || 'general_qa'
  const searchDecision = shouldEnableSearch({
    question,
    templateKey: resolvedTemplateKey,
    forceWebSearch
  })
  const promptMessages = buildMessages({
    conversation,
    messages: currentMessages,
    templateKey: resolvedTemplateKey
  })

  let answer = ''
  for await (const delta of streamChat({
    messages: promptMessages,
    enableSearch: searchDecision.enableSearch,
    forcedSearch: searchDecision.forcedSearch
  })) {
    answer += delta
    onDelta(delta)
  }

  const saved = AssistantConversation.addMessage({
    conversationId: conversation.id,
    role: 'assistant',
    content: answer || '（AI 服务未返回内容）',
    usedWebSearch: searchDecision.enableSearch,
    citations: []
  })

  if (shouldGenerateFreeTitle) {
    buildFreeConversationTitle(question)
      .then((title) => AssistantConversation.updateContextLabel(conversation.id, title))
      .catch(() => {})
  }

  return {
    message: saved,
    conversation: decorateConversation(AssistantConversation.findById(conversation.id), userId)
  }
}

function deleteConversation(userId, id) {
  return AssistantConversation.deleteOwned(id, userId)
}

function renameConversation(userId, id, title) {
  const normalized = normalizeConversationTitle(title)
  return AssistantConversation.updateOwnedContextLabel(id, userId, normalized)
}

module.exports = {
  createFreeConversation,
  createVocabularyConversation,
  createGrammarConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listSharedConversations,
  renameConversation,
  streamAssistantReply
}
