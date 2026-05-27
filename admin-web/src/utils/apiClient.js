export const AUTH_TOKEN_KEY = 'sounichinavi_token';
export const AUTH_MODE_KEY = 'sounichinavi_auth_mode';
const LEGACY_ADMIN_TOKEN_KEY = 'admin_token';

function normalizeApiBase(base) {
  const fallback = '/admin';
  if (!base) return fallback;
  const trimmed = base.replace(/\/$/, '');
  if (trimmed.endsWith('/admin-api') || trimmed.endsWith('/admin')) return trimmed;
  return `${trimmed}/admin`;
}

const API_BASE = normalizeApiBase(process.env.VUE_APP_ADMIN_API_BASE_URL);
const API_ROOT = API_BASE.replace(/\/admin$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, data = null, fieldErrors = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.fieldErrors = fieldErrors;
    this.isNetworkError = status === 0;
  }
}

function extractFieldErrors(data) {
  if (!data) return null;
  if (data.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) return data.errors;
  if (Array.isArray(data.errors)) {
    return data.errors.reduce((acc, item) => {
      if (item?.field) acc[item.field] = item.message || item.error || '字段错误';
      return acc;
    }, {});
  }
  if (data.fields && typeof data.fields === 'object') return data.fields;
  return null;
}

function buildQuery(params = {}) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (!entries.length) return '';
  const search = new URLSearchParams(entries);
  return `?${search.toString()}`;
}

function resolveApiUrl(path, params) {
  const query = buildQuery(params);
  if (/^https?:\/\//.test(path)) return `${path}${query}`;
  if (path.startsWith('/api/')) return `${API_ROOT}${path}${query}`;
  return `${API_BASE}${path}${query}`;
}

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(LEGACY_ADMIN_TOKEN_KEY) || '';
}

export function getAuthToken() {
  return getToken();
}

export function getAuthMode() {
  return localStorage.getItem(AUTH_MODE_KEY) || (localStorage.getItem(LEGACY_ADMIN_TOKEN_KEY) ? 'admin' : '');
}

export function setAuthSession(token, mode) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_MODE_KEY, mode);
  localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_MODE_KEY);
  localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);
}

export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    params,
    body,
    headers = {},
    timeout = 15000,
    auth = true
  } = options;

  const url = resolveApiUrl(path, params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const requestHeaders = { Accept: 'application/json', ...headers };

  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    clearTimeout(timer);

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json().catch(() => null) : null;

    if (!response.ok) {
      if (response.status === 401) {
        clearAuthSession();
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }

      const backendMessage = data?.error || data?.message;
      let message = backendMessage || '请求失败';
      if (response.status === 401 && !backendMessage) message = '登录已过期';
      if (response.status === 403 && !backendMessage) message = '无权限执行该操作';
      if (response.status === 409 && !backendMessage) message = '存在重复数据';

      throw new ApiError(message, {
        status: response.status,
        data,
        fieldErrors: extractFieldErrors(data)
      });
    }

    return data;
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') {
      throw new ApiError('网络异常：请求超时', { status: 0 });
    }
    throw new ApiError('网络异常：无法连接到服务器', { status: 0 });
  }
}

export function getApiBase() {
  return API_BASE;
}

export function getAdminToken() {
  return getToken();
}
