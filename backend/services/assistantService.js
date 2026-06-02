const { AssistantConversation } = require('../models/AssistantConversation')
const { Grammar } = require('../models/Grammar')
const { Vocabulary } = require('../models/Vocabulary')
const { streamChat } = require('./aiProvider')
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
    return `关于单词「${conversation.context_label || '这个词'}」，你想问些什么？`
  }
  if (conversation.context_type === 'grammar') {
    return `关于文法「${conversation.context_label || '这个文法'}」，你想问些什么？`
  }
  if (conversation.context_type === 'text') {
    return `关于文章「${conversation.context_label || '这篇文章'}」，你想问些什么？`
  }
  return '你好呀，我已经准备好啦。你可以直接向我提问。'
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

function listConversations({ userId, contextType, contextId, limit, offset }) {
  const result = AssistantConversation.listVisible({ userId, contextType, contextId, limit, offset })
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

  return {
    message: saved,
    conversation: decorateConversation(AssistantConversation.findById(conversation.id), userId)
  }
}

module.exports = {
  createFreeConversation,
  createVocabularyConversation,
  createGrammarConversation,
  getConversation,
  listConversations,
  streamAssistantReply
}
