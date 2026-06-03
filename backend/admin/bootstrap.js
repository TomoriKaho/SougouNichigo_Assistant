const { User } = require('../models/User')
const { getEnv, requireEnv } = require('../config/env')

function ensureInitialAccount({ username, password, email, role, userType, isInitialAdmin, isInitialDev }) {
  const existing =
    User.findRawByUsername(username) ||
    (isInitialDev ? User.findRawInitialDev() : null) ||
    (isInitialAdmin ? User.findRawInitialAdmin() : null)

  if (existing) {
    User.update(existing.id, {
      username,
      password,
      email,
      role,
      user_type: userType,
      grade: userType === 'teacher' ? '教师' : '高年级',
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
    grade: userType === 'teacher' ? '教师' : '高年级',
    is_initial_admin: isInitialAdmin,
    is_initial_dev: isInitialDev
  })
}

function bootstrapAdmin() {
  const devUsername = getEnv('INITIAL_DEV_USERNAME', 'dev')
  const devPassword = requireEnv('INITIAL_DEV_PASSWORD')
  const adminUsername = getEnv('INITIAL_ADMIN_USERNAME', 'admin')
  const adminPassword = requireEnv('INITIAL_ADMIN_PASSWORD')

  const devId = ensureInitialAccount({
    username: devUsername,
    password: devPassword,
    email: getEnv('INITIAL_DEV_EMAIL') || null,
    role: 'dev',
    userType: 'teacher',
    isInitialAdmin: false,
    isInitialDev: true
  })

  const adminId = ensureInitialAccount({
    username: adminUsername,
    password: adminPassword,
    email: getEnv('INITIAL_ADMIN_EMAIL') || null,
    role: 'admin',
    userType: 'teacher',
    isInitialAdmin: true,
    isInitialDev: false
  })

  User.clearInitialDevExcept(devId)
  User.clearInitialAdminExcept(adminId)

  console.log('   ✓ 初始 dev/admin 账号检查完成')
}

module.exports = {
  bootstrapAdmin
}
