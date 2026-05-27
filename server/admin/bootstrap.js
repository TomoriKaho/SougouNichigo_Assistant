const { User } = require('../models/User')

function ensureInitialAccount({ username, password, email, role, userType, isInitialAdmin, isInitialDev }) {
  const existing = User.findRawByUsername(username)
  if (existing) {
    User.update(existing.id, {
      email,
      role,
      user_type: userType,
      is_initial_admin: isInitialAdmin,
      is_initial_dev: isInitialDev
    })
    return existing.id
  }

  return User.create({
    username,
    password,
    email,
    role,
    user_type: userType,
    is_initial_admin: isInitialAdmin,
    is_initial_dev: isInitialDev
  })
}

function bootstrapAdmin() {
  const devUsername = process.env.INITIAL_DEV_USERNAME || 'dev'
  const devPassword = process.env.INITIAL_DEV_PASSWORD || 'SounichiNaviDev2026!'
  const adminUsername = process.env.INITIAL_ADMIN_USERNAME || 'admin'
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'SounichiNaviAdmin2026!'

  ensureInitialAccount({
    username: devUsername,
    password: devPassword,
    email: process.env.INITIAL_DEV_EMAIL || null,
    role: 'dev',
    userType: 'teacher',
    isInitialAdmin: false,
    isInitialDev: true
  })

  ensureInitialAccount({
    username: adminUsername,
    password: adminPassword,
    email: process.env.INITIAL_ADMIN_EMAIL || null,
    role: 'admin',
    userType: 'teacher',
    isInitialAdmin: true,
    isInitialDev: false
  })

  console.log('   ✓ 初始 dev/admin 账号检查完成')
}

module.exports = {
  bootstrapAdmin
}
