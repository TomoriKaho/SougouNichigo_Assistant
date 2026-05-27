import { computed, reactive } from 'vue';
import { apiRequest, ApiError } from '../utils/apiClient';

const TOKEN_KEY = 'admin_token';

const state = reactive({
  user: null,
  token: localStorage.getItem(TOKEN_KEY) || '',
  loading: false,
  error: ''
});

window.addEventListener('auth:expired', () => {
  state.token = '';
  state.user = null;
  localStorage.removeItem(TOKEN_KEY);
});

async function login(credentials) {
  state.loading = true;
  state.error = '';
  try {
    const identifier = credentials.identifier || credentials.email || credentials.username;
    if (!identifier || !credentials.password) throw new Error('请输入账号和密码');
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier, password: credentials.password },
      auth: false
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem(TOKEN_KEY, state.token);
    return true;
  } catch (err) {
    state.error = err instanceof ApiError ? err.message : err.message || '登录失败';
    return false;
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
    const data = await apiRequest('/auth/me');
    state.user = data.user;
    return state.user;
  } catch (error) {
    logout();
    return null;
  }
}

function logout() {
  const token = state.token;
  state.token = '';
  state.user = null;
  localStorage.removeItem(TOKEN_KEY);
  if (token) apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
}

const isAuthenticated = computed(() => Boolean(state.token && state.user));
const isDev = computed(() => state.user?.role === 'dev');
const isAdmin = computed(() => state.user?.role === 'admin');
const isPrivileged = computed(() => ['dev', 'admin'].includes(state.user?.role));
const isTeacher = computed(() => state.user?.user_type === 'teacher');
const isInitialDev = computed(() => Boolean(state.user?.isInitialDev));

export function useAuth() {
  return {
    state,
    login,
    logout,
    fetchMe,
    isAuthenticated,
    isDev,
    isAdmin,
    isPrivileged,
    isTeacher,
    isInitialDev
  };
}
