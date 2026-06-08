const { getEnv } = require('../config/env')

function providerConfig() {
  return {
    provider: getEnv('AI_PROVIDER'),
    model: getEnv('AI_MODEL'),
    apiKey: getEnv('AI_API_KEY', ''),
    baseUrl: getEnv('AI_BASE_URL'),
    assignedSites: getEnv('AI_SEARCH_ASSIGNED_SITES', '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
}

function extractDelta(payload) {
  const choice = payload?.choices?.[0]
  if (!choice) return ''
  return choice.delta?.content || choice.message?.content || ''
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function providerErrorMessage(error) {
  return String(error?.message || error || '')
}

function isRetriableProviderError(error) {
  const message = providerErrorMessage(error)
  return /terminated|fetch failed|socket|ECONNRESET|ETIMEDOUT|UND_ERR|network/i.test(message)
}

function normalizeProviderError(error) {
  if (isRetriableProviderError(error)) {
    return new Error('AI 服务连接中断，请稍后重试')
  }
  return error
}

async function parseNonStreamingResponse(response) {
  const text = await response.text()
  try {
    const payload = JSON.parse(text)
    return payload?.choices?.[0]?.message?.content || payload?.output?.text || text
  } catch (error) {
    return text
  }
}

function chatRequestBody({ messages, enableSearch = false, forcedSearch = false, stream = true } = {}) {
  const config = providerConfig()
  if (!config.provider) {
    throw new Error('缺少 AI_PROVIDER，请在 backend/.env 中配置')
  }
  if (!config.model) {
    throw new Error('缺少 AI_MODEL，请在 backend/.env 中配置')
  }
  if (!config.baseUrl) {
    throw new Error('缺少 AI_BASE_URL，请在 backend/.env 中配置')
  }
  if (!config.apiKey) {
    throw new Error('缺少 AI_API_KEY，无法调用 AI 服务')
  }

  const body = {
    model: config.model,
    messages,
    stream
  }

  if (enableSearch) {
    body.enable_search = true
    body.search_options = {
      forced_search: !!forcedSearch,
      search_strategy: 'turbo',
      enable_source: true
    }
    if (config.assignedSites.length) {
      body.search_options.assigned_site_list = config.assignedSites
    }
  }

  return { config, body }
}

async function fetchChatResponse({ messages, enableSearch = false, forcedSearch = false, stream = true } = {}) {
  const { config, body } = chatRequestBody({ messages, enableSearch, forcedSearch, stream })
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || `AI 服务请求失败：${response.status}`)
  }

  return response
}

async function completeChatOnce({ messages, enableSearch = false, forcedSearch = false } = {}) {
  const response = await fetchChatResponse({ messages, enableSearch, forcedSearch, stream: false })
  return parseNonStreamingResponse(response)
}

async function completeChat({ messages, enableSearch = false, forcedSearch = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await completeChatOnce({ messages, enableSearch, forcedSearch })
    } catch (error) {
      if (attempt === 1 || !isRetriableProviderError(error)) {
        throw normalizeProviderError(error)
      }
      await wait(600)
    }
  }
  return ''
}

async function* streamChatOnce({ messages, enableSearch = false, forcedSearch = false } = {}) {
  const response = await fetchChatResponse({ messages, enableSearch, forcedSearch, stream: true })

  const contentType = response.headers.get('content-type') || ''
  if (!response.body || !contentType.includes('stream')) {
    const fullText = await parseNonStreamingResponse(response)
    if (fullText) yield fullText
    return
  }

  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  function* extractDeltasFromPart(part) {
    const lines = part
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))

    for (const line of lines) {
      const data = line.replace(/^data:\s*/, '')
      if (!data || data === '[DONE]') continue
      try {
        const payload = JSON.parse(data)
        const delta = extractDelta(payload)
        if (delta) yield delta
      } catch (error) {
        // Ignore malformed stream fragments and continue consuming the provider stream.
      }
    }
  }

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true })
    const parts = buffer.split(/\n\n+/)
    buffer = parts.pop() || ''

    for (const part of parts) {
      yield* extractDeltasFromPart(part)
    }
  }

  if (buffer.trim()) {
    yield* extractDeltasFromPart(buffer)
  }
}

async function* streamChat({ messages, enableSearch = false, forcedSearch = false } = {}) {
  let lastError = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let emitted = false
    try {
      for await (const delta of streamChatOnce({ messages, enableSearch, forcedSearch })) {
        emitted = true
        yield delta
      }
      return
    } catch (error) {
      lastError = error
      if (emitted || !isRetriableProviderError(error)) {
        throw normalizeProviderError(error)
      }
      if (attempt === 0) {
        await wait(600)
      }
    }
  }

  try {
    const fullText = await completeChatOnce({ messages, enableSearch, forcedSearch })
    if (fullText) yield fullText
  } catch (error) {
    throw normalizeProviderError(lastError || error)
  }
}

module.exports = {
  completeChat,
  streamChat
}
