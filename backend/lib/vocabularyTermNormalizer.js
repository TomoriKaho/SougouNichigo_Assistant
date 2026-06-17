function normalizeText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text ? text : null
}

function hasKanji(value) {
  return /[\u3400-\u9fff々〆ヶ]/u.test(String(value || ''))
}

function hasKana(value) {
  return /[\u3040-\u30ffー]/u.test(String(value || ''))
}

function hasLatin(value) {
  return /[A-Za-z]/.test(String(value || ''))
}

function hasTermDisqualifier(value) {
  return /[\u3400-\u9fff々〆ヶA-Za-z0-9]/u.test(String(value || ''))
}

function isKanaReadingTerm(value) {
  const text = normalizeText(value)
  return !!text && hasKana(text) && !hasTermDisqualifier(text)
}

function shouldSwapKanaTermWithKanjiSupplement(term, supplement) {
  const normalizedTerm = normalizeText(term)
  const normalizedSupplement = normalizeText(supplement)
  return (
    isKanaReadingTerm(normalizedTerm) &&
    !!normalizedSupplement &&
    hasKanji(normalizedSupplement) &&
    !hasLatin(normalizedSupplement)
  )
}

function normalizeVocabularyWordFields(word, { swapKanaTermWithKanjiSupplement = false } = {}) {
  const term = normalizeText(word?.['词条'])
  const supplement = normalizeText(word?.['词条补充'])
  if (!swapKanaTermWithKanjiSupplement || !shouldSwapKanaTermWithKanjiSupplement(term, supplement)) {
    return { term, supplement, swapped: false }
  }

  return {
    term: supplement,
    supplement: term,
    swapped: true
  }
}

module.exports = {
  normalizeVocabularyWordFields,
  shouldSwapKanaTermWithKanjiSupplement
}
