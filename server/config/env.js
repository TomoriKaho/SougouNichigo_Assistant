const path = require('path')
const dotenv = require('dotenv')

const envPath = path.resolve(__dirname, '..', '.env')
let loaded = false

function loadEnv() {
  if (loaded) return envPath

  const result = dotenv.config({ path: envPath })
  loaded = true

  if (result.error) {
    throw new Error(`缺少后端环境配置文件: ${envPath}`)
  }

  return envPath
}

function getEnv(name, fallback = '') {
  loadEnv()
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : value
}

function requireEnv(name) {
  loadEnv()
  const value = process.env[name]
  if (value === undefined || value === '') {
    throw new Error(`缺少必要环境变量 ${name}，请在 ${envPath} 中配置`)
  }
  return value
}

module.exports = {
  envPath,
  getEnv,
  loadEnv,
  requireEnv
}
