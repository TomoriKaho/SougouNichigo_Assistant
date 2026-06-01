const fs = require('fs')
const path = require('path')
const { deriveVocabularyFlags } = require('../backend/lib/vocabularyFlags')

const filePath = path.resolve(__dirname, '..', 'data', 'Vocabulary_4.json')
const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))

let total = 0
const counters = {
  properNoun: 0,
  onomatopoeia: 0,
  loanword: 0,
  kanjiWord: 0
}

for (const lesson of raw) {
  for (const unit of lesson['单元'] || []) {
    for (const table of unit['词表'] || []) {
      for (const word of table['词条列表'] || []) {
        const flags = deriveVocabularyFlags({
          term: word['词条'],
          supplement: word['词条补充'],
          partOfSpeech: word['词性'],
          explanation: word['词语解释'] || word['解释']
        })

        word['专有名词'] = flags.properNoun
        word['オノマトペ'] = flags.onomatopoeia
        word['外来词'] = flags.loanword
        word['汉字词'] = flags.kanjiWord

        total += 1
        if (flags.properNoun) counters.properNoun += 1
        if (flags.onomatopoeia) counters.onomatopoeia += 1
        if (flags.loanword) counters.loanword += 1
        if (flags.kanjiWord) counters.kanjiWord += 1
      }
    }
  }
}

fs.writeFileSync(filePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ total, counters }, null, 2))
