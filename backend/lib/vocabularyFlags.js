const HAN_RE = /[\p{Script=Han}]/u
const LATIN_RE = /[A-Za-z]/
const KATAKANA_ONLY_RE = /^[\p{Script=Katakana}ー・]+$/u
const KANA_ONLY_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u

const PROPER_NOUN_HINT_RE =
  /(人名|地名|作品名|团体名|團體名|机构名|機構名|组织名|組織名|国名|國名|书名|書名|校名|公司名|出版社名|桥梁名称|橋梁名稱|姓氏)/

const PROPER_NOUN_ROLE_RE =
  /(日本作家|作家|歌手|漫画家|漫畫家|记者|記者|学者|學者|出版社|公司|大学|大學|书名|書名|团体名|團體名|人名|地名)/

const LOANWORD_EXCLUDE_HINT_RE = /方言/

const ONOMATOPOEIA_INCLUDE_SET = new Set([
  'ぎゃああ',
  'ぴったり',
  'たっぷり',
  'ぐしゃぐしゃ',
  'ざっと',
  'すらすら',
  'ガタガタ',
  'ぐーっと',
  'おーっとっと',
  'よいしょ',
  'ひょっとして',
  'どっぷり',
  'じーん',
  'どーんと',
  'コツコツ',
  'ずるずる',
  'きゃー'
])

const ONOMATOPOEIA_EXCLUDE_SET = new Set([
  'かれこれ',
  'かいかい',
  'かずかず',
  'しんしん',
  'どれどれ',
  'やれやれ',
  'こらこら'
])

function normalizeText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function cleanKanaCandidate(value) {
  return normalizeText(value).replace(/[▼▽・／/＝=‐‑–—\-\s]/g, '')
}

function hasKanji(value) {
  return HAN_RE.test(normalizeText(value))
}

function isProperNoun({ term, supplement, partOfSpeech, explanation }) {
  const pos = normalizeText(partOfSpeech)
  const exp = normalizeText(explanation)
  if (pos.includes('固名')) return true
  if (PROPER_NOUN_HINT_RE.test(exp)) return true
  if (PROPER_NOUN_ROLE_RE.test(exp) && /[（）()]/.test(exp)) return true

  const combined = `${normalizeText(term)} ${normalizeText(supplement)} ${exp}`
  return /(姓氏|人名|地名|书名|書名|团体名|團體名)/.test(combined)
}

function looksLikeOnomatopoeia(base) {
  if (ONOMATOPOEIA_INCLUDE_SET.has(base)) return true
  if (ONOMATOPOEIA_EXCLUDE_SET.has(base)) return false
  if (!KANA_ONLY_RE.test(base)) return false

  return (
    /^(.{1,3})\1$/.test(base) ||
    /^.{1,2}っ.{1,2}(り|と)$/.test(base) ||
    /^.{1,2}ーっと$/.test(base) ||
    /^.{1,2}ーん$/.test(base) ||
    /^.{1,2}んと$/.test(base)
  )
}

function isOnomatopoeia({ term, supplement, partOfSpeech, explanation }) {
  const pos = normalizeText(partOfSpeech)
  const exp = normalizeText(explanation)
  const base = cleanKanaCandidate(supplement) || cleanKanaCandidate(term)

  if (/(拟声|擬声|拟态|擬態|象声|象態|オノマトペ)/.test(exp)) return true
  if (!looksLikeOnomatopoeia(base)) return false
  return /副|感/.test(pos) || ONOMATOPOEIA_INCLUDE_SET.has(base)
}

function isLoanword({ term, supplement, explanation }, { properNoun = false, onomatopoeia = false } = {}) {
  if (properNoun || onomatopoeia) return false

  const normalizedTerm = normalizeText(term)
  const normalizedSupplement = normalizeText(supplement)
  const exp = normalizeText(explanation)

  if (LOANWORD_EXCLUDE_HINT_RE.test(exp)) return false
  if (LATIN_RE.test(normalizedSupplement) || LATIN_RE.test(normalizedTerm)) return true
  if (KATAKANA_ONLY_RE.test(normalizedTerm)) return true
  return false
}

function deriveVocabularyFlags({ term, supplement, partOfSpeech, explanation }) {
  const properNoun = isProperNoun({ term, supplement, partOfSpeech, explanation })
  const onomatopoeia = isOnomatopoeia({ term, supplement, partOfSpeech, explanation })
  const loanword = isLoanword({ term, supplement, explanation }, { properNoun, onomatopoeia })
  const kanjiWord = hasKanji(term) || hasKanji(supplement)

  return {
    properNoun,
    onomatopoeia,
    loanword,
    kanjiWord
  }
}

module.exports = {
  deriveVocabularyFlags
}
