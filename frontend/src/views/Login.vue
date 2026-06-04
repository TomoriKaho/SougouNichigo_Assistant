<template>
  <main class="login-page">
    <section class="login-card" :class="{ 'login-card-register': mode === 'register' }">
      <h1>登录到 総日ナビ</h1>

      <form v-if="mode === 'login'" @submit.prevent="loginMethod === 'password' ? submitUserLogin() : submitEmailCodeLogin()">
        <div class="login-method-tabs" role="tablist" aria-label="登录方式">
          <button
            type="button"
            :class="{ active: loginMethod === 'password' }"
            @click="switchLoginMethod('password')"
          >
            密码登录
          </button>
          <button
            type="button"
            :class="{ active: loginMethod === 'emailCode' }"
            @click="switchLoginMethod('emailCode')"
          >
            邮箱验证
          </button>
        </div>

        <template v-if="loginMethod === 'password'">
          <label>
            账号
            <input v-model.trim="loginForm.identifier" autocomplete="username" placeholder="用户名或邮箱" />
          </label>
          <label>
            密码
            <input v-model="loginForm.password" autocomplete="current-password" type="password" placeholder="请输入密码" />
          </label>
        </template>

        <template v-else>
          <label>
            PKU 邮箱
            <input
              v-model.trim="loginEmailForm.email"
              autocomplete="email"
              :class="loginEmailErrors.email ? 'input-error' : ''"
              placeholder="name@stu.pku.edu.cn"
              @blur="validateLoginEmailField('email')"
              @input="validateLoginEmailFieldIfTouched('email')"
            />
            <span :class="loginEmailErrors.email ? 'field-error' : 'field-hint'">
              {{ loginEmailErrors.email || '仅支持PKU邮箱。' }}
            </span>
          </label>
          <label>
            验证码
            <div class="email-code-row">
              <input
                v-model.trim="loginEmailForm.emailCode"
                autocomplete="one-time-code"
                inputmode="numeric"
                maxlength="6"
                :class="loginEmailErrors.emailCode ? 'input-error' : ''"
                placeholder="6位验证码"
                @blur="validateLoginEmailField('emailCode')"
                @input="validateLoginEmailFieldIfTouched('emailCode')"
              />
              <button class="ghost" type="button" :disabled="loginCodeSending || loginCodeCooldown > 0" @click="sendLoginEmailCode">
                {{ loginCodeButtonText }}
              </button>
            </div>
            <span :class="loginEmailErrors.emailCode ? 'field-error' : 'field-hint'">
              {{ loginEmailErrors.emailCode || loginCodeNotice || '验证码 10 分钟内有效。' }}
            </span>
          </label>
        </template>

        <p v-if="errorText" class="error">{{ errorText }}</p>
        <button type="submit" :disabled="state.loading">
          {{ state.loading ? '登录中...' : '登录' }}
        </button>
        <div class="login-secondary-actions">
          <button class="ghost" type="button" :disabled="state.loading || loginMethod !== 'password'" @click="submitAdminLogin">以管理员身份登录</button>
          <button class="ghost" type="button" :disabled="state.loading" @click="openRegister">注册</button>
        </div>
      </form>

      <form v-else @submit.prevent="submitRegister">
        <label>
          邮箱
          <input
            v-model.trim="registerForm.email"
            autocomplete="email"
            :class="fieldStatus('email')"
            placeholder="name@stu.pku.edu.cn"
            @blur="validateField('email')"
            @input="validateFieldIfTouched('email')"
          />
          <span :class="registerErrors.email ? 'field-error' : 'field-hint'">
            {{ registerErrors.email || '仅支持PKU邮箱。' }}
          </span>
        </label>
        <label>
          邮箱验证码
          <div class="email-code-row">
            <input
              v-model.trim="registerForm.emailCode"
              autocomplete="one-time-code"
              inputmode="numeric"
              maxlength="6"
              :class="fieldStatus('emailCode')"
              placeholder="6位验证码"
              @blur="validateField('emailCode')"
              @input="validateFieldIfTouched('emailCode')"
            />
            <button class="ghost" type="button" :disabled="registerCodeSending || registerCodeCooldown > 0" @click="sendRegisterEmailCode">
              {{ registerCodeButtonText }}
            </button>
          </div>
          <span :class="registerErrors.emailCode ? 'field-error' : 'field-hint'">
            {{ registerErrors.emailCode || registerCodeNotice || '请先获取验证码再创建账号。' }}
          </span>
        </label>
        <label>
          用户名
          <input
            v-model.trim="registerForm.username"
            autocomplete="username"
            :class="fieldStatus('username')"
            placeholder="6-15位字母或数字"
            @blur="validateField('username')"
            @input="validateFieldIfTouched('username')"
          />
          <span :class="registerErrors.username ? 'field-error' : 'field-hint'">
            {{ registerErrors.username || '6-15位，只能使用英文字母和数字。' }}
          </span>
        </label>
        <label>
          密码
          <input
            v-model="registerForm.password"
            autocomplete="new-password"
            type="password"
            :class="fieldStatus('password')"
            placeholder="8-20位，至少两类字符"
            @blur="validateField('password')"
            @input="validateFieldIfTouched('password')"
          />
          <span :class="registerErrors.password ? 'field-error' : 'field-hint'">
            {{ registerErrors.password || '支持字母、数字、!@#$%^&*()_+-.，至少包含两类。' }}
          </span>
        </label>
        <label>
          身份
          <select v-model="registerForm.user_type" @change="handleUserTypeChange">
            <option value="student">学生</option>
            <option value="teacher">教师</option>
          </select>
          <span :class="registerErrors.user_type ? 'field-error' : 'field-hint'">
            {{ registerErrors.user_type || '请先选择注册身份。' }}
          </span>
        </label>
        <label v-if="registerForm.user_type === 'student'">
          年级
          <select v-model="registerForm.grade" @change="validateField('grade')">
            <option value="">请选择年级</option>
            <option v-for="grade in studentGradeOptions" :key="grade" :value="grade">{{ grade }}</option>
          </select>
          <span :class="registerErrors.grade ? 'field-error' : 'field-hint'">
            {{ registerErrors.grade || '学生用户请选择当前年级。' }}
          </span>
        </label>
        <p v-if="errorText" class="error">{{ errorText }}</p>
        <div class="login-register-actions">
          <button type="submit" :disabled="state.loading">
            {{ state.loading ? '注册中...' : '创建账号' }}
          </button>
          <button class="ghost" type="button" :disabled="state.loading" @click="closeRegister">返回登录</button>
        </div>
      </form>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const route = useRoute();
const { state, login, loginWithEmailCode, sendEmailCode, register } = useAuth();
const mode = ref('login');
const loginMethod = ref('password');
const studentGradeOptions = ['大一上', '大一下', '大二上', '大二下', '高年级'];

const loginForm = reactive({ identifier: '', password: '' });
const loginEmailForm = reactive({ email: '', emailCode: '' });
const loginEmailErrors = reactive({ email: '', emailCode: '' });
const loginEmailTouched = reactive({ email: false, emailCode: false });
const registerForm = reactive({ email: '', emailCode: '', username: '', password: '', user_type: 'student', grade: '' });
const registerErrors = reactive({ email: '', emailCode: '', username: '', password: '', user_type: '', grade: '' });
const touched = reactive({ email: false, emailCode: false, username: false, password: false, user_type: false, grade: false });
const registerCodeCooldown = ref(0);
const loginCodeCooldown = ref(0);
const registerCodeSending = ref(false);
const loginCodeSending = ref(false);
const registerCodeNotice = ref('');
const loginCodeNotice = ref('');
let registerCodeTimer = null;
let loginCodeTimer = null;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailCodePattern = /^\d{6}$/;
const usernamePattern = /^[A-Za-z0-9]{6,15}$/;
const passwordPattern = /^[A-Za-z0-9!@#$%^&*()_+\-.]{8,20}$/;

const errorText = computed(() => {
  if (route.query.error === 'forbidden') return '无权访问该页面';
  return state.error;
});

function passwordIsValid(value) {
  const password = String(value || '').trim();
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-.]/.test(password);
  return passwordPattern.test(password) && [hasLetter, hasNumber, hasSymbol].filter(Boolean).length >= 2;
}

function isPkuEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0) return false;
  const domain = email.slice(atIndex + 1);
  return domain === 'pku.edu.cn' || domain.endsWith('.pku.edu.cn');
}

function startCooldown(target, timerName, seconds = 60) {
  target.value = seconds;
  if (timerName === 'register' && registerCodeTimer) clearInterval(registerCodeTimer);
  if (timerName === 'login' && loginCodeTimer) clearInterval(loginCodeTimer);

  const timer = setInterval(() => {
    target.value = Math.max(0, target.value - 1);
    if (target.value <= 0) {
      clearInterval(timer);
      if (timerName === 'register') registerCodeTimer = null;
      if (timerName === 'login') loginCodeTimer = null;
    }
  }, 1000);

  if (timerName === 'register') registerCodeTimer = timer;
  if (timerName === 'login') loginCodeTimer = timer;
}

const registerCodeButtonText = computed(() => {
  if (registerCodeSending.value) return '发送中...';
  return registerCodeCooldown.value > 0 ? `${registerCodeCooldown.value}s` : '获取验证码';
});

const loginCodeButtonText = computed(() => {
  if (loginCodeSending.value) return '发送中...';
  return loginCodeCooldown.value > 0 ? `${loginCodeCooldown.value}s` : '获取验证码';
});

function validateField(field) {
  touched[field] = true;
  if (field === 'email') {
    if (!registerForm.email) registerErrors.email = '请输入邮箱地址';
    else if (!emailPattern.test(registerForm.email)) registerErrors.email = '请输入有效的邮箱地址';
    else if (!isPkuEmail(registerForm.email)) registerErrors.email = '仅支持PKU邮箱';
    else registerErrors.email = '';
  }

  if (field === 'emailCode') {
    if (!registerForm.emailCode) registerErrors.emailCode = '请输入邮箱验证码';
    else if (!emailCodePattern.test(registerForm.emailCode)) registerErrors.emailCode = '验证码需为6位数字';
    else registerErrors.emailCode = '';
  }

  if (field === 'username') {
    if (!registerForm.username) registerErrors.username = '请输入用户名';
    else if (!usernamePattern.test(registerForm.username)) registerErrors.username = '用户名需为6-15位字母或数字组合';
    else registerErrors.username = '';
  }

  if (field === 'password') {
    if (!registerForm.password) registerErrors.password = '请输入密码';
    else if (!passwordIsValid(registerForm.password)) registerErrors.password = '密码需为8-20位，包含字母、数字、特殊符号中的至少两种';
    else registerErrors.password = '';
  }

  if (field === 'user_type') {
    if (!registerForm.user_type) registerErrors.user_type = '请选择身份';
    else registerErrors.user_type = '';
  }

  if (field === 'grade') {
    if (registerForm.user_type === 'student' && !registerForm.grade) registerErrors.grade = '请选择年级';
    else registerErrors.grade = '';
  }

  return !registerErrors[field];
}

function validateFieldIfTouched(field) {
  if (touched[field] || registerForm[field]) validateField(field);
}

function validateRegisterForm() {
  return ['email', 'emailCode', 'username', 'password', 'user_type', 'grade'].map(validateField).every(Boolean);
}

function fieldStatus(field) {
  if (registerErrors[field]) return 'input-error';
  if (field === 'email' && registerForm.email && emailPattern.test(registerForm.email) && isPkuEmail(registerForm.email)) return 'input-success';
  if (field === 'emailCode' && registerForm.emailCode && emailCodePattern.test(registerForm.emailCode)) return 'input-success';
  if (field === 'username' && registerForm.username && usernamePattern.test(registerForm.username)) return 'input-success';
  if (field === 'password' && registerForm.password && passwordIsValid(registerForm.password)) return 'input-success';
  return '';
}

function clearRegisterErrors() {
  registerErrors.email = '';
  registerErrors.emailCode = '';
  registerErrors.username = '';
  registerErrors.password = '';
  registerErrors.user_type = '';
  registerErrors.grade = '';
  touched.email = false;
  touched.emailCode = false;
  touched.username = false;
  touched.password = false;
  touched.user_type = false;
  touched.grade = false;
}

function resetRegisterForm() {
  registerForm.email = '';
  registerForm.emailCode = '';
  registerForm.username = '';
  registerForm.password = '';
  registerForm.user_type = 'student';
  registerForm.grade = '';
  registerCodeNotice.value = '';
}

function handleUserTypeChange() {
  touched.user_type = true;
  validateField('user_type');
  if (registerForm.user_type === 'teacher') {
    registerForm.grade = '教师';
    registerErrors.grade = '';
    touched.grade = false;
  } else if (!studentGradeOptions.includes(registerForm.grade)) {
    registerForm.grade = '';
  }
}

function openRegister() {
  state.error = '';
  resetRegisterForm();
  clearRegisterErrors();
  mode.value = 'register';
}

function closeRegister() {
  state.error = '';
  clearRegisterErrors();
  mode.value = 'login';
}

function switchLoginMethod(method) {
  state.error = '';
  loginMethod.value = method;
}

function validateLoginEmailField(field) {
  loginEmailTouched[field] = true;
  if (field === 'email') {
    if (!loginEmailForm.email) loginEmailErrors.email = '请输入邮箱地址';
    else if (!emailPattern.test(loginEmailForm.email)) loginEmailErrors.email = '请输入有效的邮箱地址';
    else if (!isPkuEmail(loginEmailForm.email)) loginEmailErrors.email = '仅支持PKU邮箱';
    else loginEmailErrors.email = '';
  }

  if (field === 'emailCode') {
    if (!loginEmailForm.emailCode) loginEmailErrors.emailCode = '请输入邮箱验证码';
    else if (!emailCodePattern.test(loginEmailForm.emailCode)) loginEmailErrors.emailCode = '验证码需为6位数字';
    else loginEmailErrors.emailCode = '';
  }

  return !loginEmailErrors[field];
}

function validateLoginEmailFieldIfTouched(field) {
  if (loginEmailTouched[field] || loginEmailForm[field]) validateLoginEmailField(field);
}

function validateLoginEmailForm() {
  return ['email', 'emailCode'].map(validateLoginEmailField).every(Boolean);
}

async function sendRegisterEmailCode() {
  state.error = '';
  registerCodeNotice.value = '';
  if (!validateField('email')) return;
  registerCodeSending.value = true;
  const result = await sendEmailCode(registerForm.email, 'register');
  registerCodeSending.value = false;
  if (!result.ok) {
    Object.assign(registerErrors, result.fieldErrors || {});
    return;
  }
  registerCodeNotice.value = '验证码已发送，请查收邮箱。';
  startCooldown(registerCodeCooldown, 'register');
}

async function sendLoginEmailCode() {
  state.error = '';
  loginCodeNotice.value = '';
  if (!validateLoginEmailField('email')) return;
  loginCodeSending.value = true;
  const result = await sendEmailCode(loginEmailForm.email, 'login');
  loginCodeSending.value = false;
  if (!result.ok) {
    Object.assign(loginEmailErrors, result.fieldErrors || {});
    return;
  }
  loginCodeNotice.value = result.data?.message || '验证码已发送，请查收邮箱。';
  startCooldown(loginCodeCooldown, 'login');
}

async function submitUserLogin() {
  const ok = await login(loginForm, 'user');
  if (!ok) return;
  router.push({ name: 'Dashboard' });
}

async function submitEmailCodeLogin() {
  state.error = '';
  if (!validateLoginEmailForm()) return;

  const result = await loginWithEmailCode({
    email: loginEmailForm.email,
    emailCode: loginEmailForm.emailCode
  });
  if (!result.ok) {
    Object.assign(loginEmailErrors, result.fieldErrors || {});
    return;
  }
  router.push({ name: 'Dashboard' });
}

async function submitAdminLogin() {
  const ok = await login(loginForm, 'admin');
  if (!ok) return;
  router.push(route.query.redirect || { name: 'Dashboard' });
}

async function submitRegister() {
  state.error = '';
  if (!validateRegisterForm()) return;

  const result = await register({
    email: registerForm.email,
    emailCode: registerForm.emailCode,
    username: registerForm.username,
    password: registerForm.password,
    user_type: registerForm.user_type,
    grade: registerForm.user_type === 'teacher' ? '教师' : registerForm.grade
  });
  if (!result.ok) {
    Object.assign(registerErrors, result.fieldErrors || {});
    return;
  }
  router.push({ name: 'Dashboard' });
}

onBeforeUnmount(() => {
  if (registerCodeTimer) clearInterval(registerCodeTimer);
  if (loginCodeTimer) clearInterval(loginCodeTimer);
});
</script>
