const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')

const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath })
} else {
  require('dotenv').config()
}

const { initDatabase } = require('./database/db')
const { bootstrapAdmin } = require('./admin/bootstrap')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

initDatabase()
bootstrapAdmin()

app.use('/admin', require('./routes/admin'))
app.use('/api/user', require('./routes/user'))
app.use('/api/feedback', require('./routes/feedback'))

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    name: 'SounichiNavi',
    japaneseName: '総日ナビ'
  })
})

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: '服务器内部错误' })
})

app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' })
})

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60))
  console.log('  🚀 総日ナビ / SounichiNavi')
  console.log('='.repeat(60))
  console.log(`  📡 服务地址: http://localhost:${PORT}`)
  console.log(`  📋 健康检查: http://localhost:${PORT}/api/health`)
  console.log('='.repeat(60) + '\n')
})

module.exports = app
