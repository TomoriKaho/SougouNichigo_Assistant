<template>
  <main class="login-page">
    <section class="login-card">
      <h1>登录到 総日ナビ</h1>

      <form v-if="mode === 'login'" @submit.prevent="submitUserLogin">
        <label>
          账号
          <input v-model.trim="loginForm.identifier" autocomplete="username" placeholder="用户名或邮箱" />
        </label>
        <label>
          密码
          <input v-model="loginForm.password" autocomplete="current-password" type="password" placeholder="请输入密码" />
        </label>
        <p v-if="errorText" class="error">{{ errorText }}</p>
        <button type="submit" :disabled="state.loading">
          {{ state.loading ? '登录中...' : '登录' }}
        </button>
        <div class="login-secondary-actions">
          <button class="ghost" type="button" :disabled="state.loading" @click="submitAdminLogin">以管理员身份登录</button>
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
            placeholder="name@example.com"
            @blur="validateField('email')"
            @input="validateFieldIfTouched('email')"
          />
          <span :class="registerErrors.email ? 'field-error' : 'field-hint'">
            {{ registerErrors.email || '请输入有效邮箱，不需要验证码。' }}
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
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const route = useRoute();
const { state, login, register } = useAuth();
const mode = ref('login');

const loginForm = reactive({ identifier: '', password: '' });
const registerForm = reactive({ email: '', username: '', password: '' });
const registerErrors = reactive({ email: '', username: '', password: '' });
const touched = reactive({ email: false, username: false, password: false });

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

function validateField(field) {
  touched[field] = true;
  if (field === 'email') {
    if (!registerForm.email) registerErrors.email = '请输入邮箱地址';
    else if (!emailPattern.test(registerForm.email)) registerErrors.email = '请输入有效的邮箱地址';
    else registerErrors.email = '';
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

  return !registerErrors[field];
}

function validateFieldIfTouched(field) {
  if (touched[field] || registerForm[field]) validateField(field);
}

function validateRegisterForm() {
  return ['email', 'username', 'password'].map(validateField).every(Boolean);
}

function fieldStatus(field) {
  if (registerErrors[field]) return 'input-error';
  if (field === 'email' && registerForm.email && emailPattern.test(registerForm.email)) return 'input-success';
  if (field === 'username' && registerForm.username && usernamePattern.test(registerForm.username)) return 'input-success';
  if (field === 'password' && registerForm.password && passwordIsValid(registerForm.password)) return 'input-success';
  return '';
}

function clearRegisterErrors() {
  registerErrors.email = '';
  registerErrors.username = '';
  registerErrors.password = '';
  touched.email = false;
  touched.username = false;
  touched.password = false;
}

function openRegister() {
  state.error = '';
  clearRegisterErrors();
  mode.value = 'register';
}

function closeRegister() {
  state.error = '';
  clearRegisterErrors();
  mode.value = 'login';
}

async function submitUserLogin() {
  const ok = await login(loginForm, 'user');
  if (!ok) return;
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
    username: registerForm.username,
    password: registerForm.password
  });
  if (!result.ok) {
    Object.assign(registerErrors, result.fieldErrors || {});
    return;
  }
  router.push({ name: 'Dashboard' });
}
</script>
