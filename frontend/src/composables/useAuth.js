import { computed, reactive } from 'vue';
import {
  apiRequest,
  ApiError,
  clearAuthSession,
  getAuthMode,
  getAuthToken,
  setAuthSession
} from '../utils/apiClient';

const state = reactive({
  user: null,
  token: getAuthToken(),
  mode: getAuthMode(),
  loading: false,
  error: ''
});

window.addEventListener('auth:expired', () => {
  state.token = '';
  state.mode = '';
  state.user = null;
  clearAuthSession();
});

async function login(credentials, mode = 'user') {
  state.loading = true;
  state.error = '';
  try {
    const identifier = credentials.identifier || credentials.email || credentials.username;
    if (!identifier || !credentials.password) throw new Error('请输入账号和密码');
    const endpoint = mode === 'admin' ? '/auth/login' : '/api/user/login';
    const data = await apiRequest(endpoint, {
      method: 'POST',
      body: { identifier, password: credentials.password },
      auth: false
    });

    state.token = data.token;
    state.user = data.user;
    state.mode = mode;
    setAuthSession(state.token, mode);
    return true;
  } catch (err) {
    state.error = err instanceof ApiError ? err.message : err.message || '登录失败';
    return false;
  } finally {
    state.loading = false;
  }
}

async function loginWithEmailCode(credentials) {
  state.loading = true;
  state.error = '';
  try {
    const email = String(credentials.email || '').trim();
    const emailCode = String(credentials.emailCode || credentials.code || '').trim();
    if (!email || !emailCode) throw new Error('请输入邮箱和验证码');
    const data = await apiRequest('/api/user/login/email-code', {
      method: 'POST',
      body: { email, emailCode },
      auth: false
    });

    state.token = data.token;
    state.user = data.user;
    state.mode = 'user';
    setAuthSession(state.token, 'user');
    return { ok: true, fieldErrors: null };
  } catch (err) {
    state.error = err instanceof ApiError ? err.message : err.message || '登录失败';
    return {
      ok: false,
      fieldErrors: err instanceof ApiError ? err.fieldErrors : null
    };
  } finally {
    state.loading = false;
  }
}

async function sendEmailCode(email, purpose = 'register') {
  state.error = '';
  try {
    const data = await apiRequest('/api/user/email-code', {
      method: 'POST',
      body: { email, purpose },
      auth: false
    });
    return { ok: true, data, fieldErrors: null };
  } catch (err) {
    state.error = err instanceof ApiError ? err.message : err.message || '验证码发送失败';
    return {
      ok: false,
      fieldErrors: err instanceof ApiError ? err.fieldErrors : null
    };
  }
}

async function register(payload) {
  state.loading = true;
  state.error = '';
  try {
    const data = await apiRequest('/api/user/register', {
      method: 'POST',
      body: payload,
      auth: false
    });

    state.token = data.token;
    state.user = data.user;
    state.mode = 'user';
    setAuthSession(state.token, 'user');
    return { ok: true, fieldErrors: null };
  } catch (err) {
    state.error = err instanceof ApiError ? err.message : err.message || '注册失败';
    return {
      ok: false,
      fieldErrors: err instanceof ApiError ? err.fieldErrors : null
    };
  } finally {
    state.loading = false;
  }
}

async function fetchMe() {
  if (!state.token) {
    state.user = null;
    return null;
  }
  try {
    const endpoint = state.mode === 'admin' ? '/auth/me' : '/api/user/me';
    const data = await apiRequest(endpoint);
    state.user = data.user;
    return state.user;
  } catch (error) {
    logout();
    return null;
  }
}

function logout() {
  const token = state.token;
  const mode = state.mode;
  state.token = '';
  state.mode = '';
  state.user = null;
  clearAuthSession();
  if (token && mode === 'admin') apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
}

const isAuthenticated = computed(() => Boolean(state.token && state.user));
const isAdminMode = computed(() => state.mode === 'admin');
const isDev = computed(() => isAdminMode.value && state.user?.role === 'dev');
const isAdmin = computed(() => isAdminMode.value && state.user?.role === 'admin');
const isPrivileged = computed(() => isAdminMode.value && ['dev', 'admin'].includes(state.user?.role));
const isTeacher = computed(() => state.user?.user_type === 'teacher');
const isInitialDev = computed(() => Boolean(state.user?.isInitialDev));
const isUserMode = computed(() => state.mode === 'user');

export function useAuth() {
  return {
    state,
    login,
    loginWithEmailCode,
    sendEmailCode,
    register,
    logout,
    fetchMe,
    isAuthenticated,
    isAdminMode,
    isDev,
    isAdmin,
    isPrivileged,
    isTeacher,
    isInitialDev,
    isUserMode
  };
}
