<template>
  <section class="card management-page reading-materials-page user-reading-materials-page">
    <div class="management-header">
      <div>
        <h2>阅读材料</h2>
        <p class="muted total-count">共 {{ total }} 个文件</p>
      </div>
      <div class="toolbar management-toolbar">
        <div class="toolbar-left">
          <input v-model.trim="keyword" placeholder="搜索标题/文件名" @keydown.enter.prevent="refresh" />
          <button class="ghost" @click="toggleIdOrder" :disabled="loading">
            {{ idOrder === 'asc' ? '最新优先' : '最早优先' }}
          </button>
          <button class="ghost" @click="refresh" :disabled="loading">刷新</button>
        </div>
      </div>
    </div>

    <div class="management-page-body">
      <div v-if="error" class="error-block">
        <p class="error">{{ error }}</p>
        <button class="ghost" @click="refresh">重试</button>
      </div>
      <div v-else-if="loading" class="loading">加载中...</div>
      <div v-else class="management-table-scroll">
        <table class="table reading-materials-table user-reading-materials-table">
          <thead>
            <tr>
              <th>标题</th>
              <th>上传者</th>
              <th>文件格式</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in rows" :key="item.id">
              <td>
                <span class="reading-material-title" :title="item.title">{{ item.title }}</span>
              </td>
              <td>{{ item.uploader_username || '-' }}</td>
              <td>{{ formatMaterialType(item) }}</td>
              <td class="actions">
                <a
                  v-if="item.can_view && item.view_url"
                  class="ghost table-action-link"
                  :href="item.view_url"
                  target="_blank"
                  rel="noopener"
                >查看</a>
                <button v-else class="ghost" disabled title="该文件暂不可在线查看，请下载后打开">查看</button>
                <button class="ghost" @click="downloadMaterial(item)">下载</button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="4" class="empty">暂无阅读材料</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="pagination management-inline-pagination">
      <button class="ghost" :disabled="page === 1 || loading" @click="changePage(page - 1)">上一页</button>
      <label class="management-pagination-jump" for="user-reading-materials-page-jump">
        第
        <input
          id="user-reading-materials-page-jump"
          v-model.number="pageJump"
          class="management-page-number-input"
          type="number"
          min="1"
          :max="totalPages"
          :disabled="totalPages <= 1 || loading"
          @keydown.enter.prevent="jumpToPage"
          @blur="jumpToPage"
        />
        / {{ totalPages }} 页
      </label>
      <button class="ghost" :disabled="page === totalPages || loading" @click="changePage(page + 1)">下一页</button>
    </div>

    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest, ApiError, getApiRoot, getAuthToken } from '../utils/apiClient';
import { useAuth } from '../composables/useAuth';

const { logout } = useAuth();
const router = useRouter();

const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(50);
const pageJump = ref(1);
const keyword = ref('');
const idOrder = ref('desc');
const loading = ref(false);
const error = ref('');
const toast = reactive({ visible: false, message: '', type: 'info' });
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

function showToast(message, type = 'info') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  setTimeout(() => (toast.visible = false), 1600);
}

function handleApiError(err) {
  if (err instanceof ApiError && err.status === 401) {
    showToast('登录已过期', 'error');
    logout();
    router.push({ name: 'Login' });
    return;
  }
  showToast(err instanceof ApiError ? err.message : '操作失败', 'error');
}

function formatMaterialType(item) {
  return item.file_format || String(item.original_filename || '').split('.').pop()?.toUpperCase() || '文件';
}

async function fetchRaw(path) {
  const response = await fetch(`${getApiRoot()}${path}`, {
    headers: {
      Authorization: `Bearer ${getAuthToken()}`
    }
  });
  if (response.status === 401) {
    logout();
    router.push({ name: 'Login' });
    throw new ApiError('登录已过期', { status: 401 });
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(data?.error || data?.message || '请求失败', { status: response.status, data });
  }
  return response;
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/api/user/reading-materials', {
      params: {
        limit: pageSize.value,
        offset: (page.value - 1) * pageSize.value,
        keyword: keyword.value,
        id_order: idOrder.value
      }
    });
    rows.value = data.rows || [];
    total.value = data.total || 0;
    pageJump.value = page.value;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  } finally {
    loading.value = false;
  }
}

function changePage(nextPage) {
  page.value = Math.min(Math.max(1, nextPage), totalPages.value);
  refresh();
}

function jumpToPage() {
  changePage(Number(pageJump.value || 1));
}

function toggleIdOrder() {
  idOrder.value = idOrder.value === 'asc' ? 'desc' : 'asc';
  page.value = 1;
  refresh();
}

async function materialBlob(item) {
  const response = await fetchRaw(`/api/user/reading-materials/${item.id}/content`);
  return response.blob();
}

async function downloadMaterial(item) {
  try {
    const blob = await materialBlob(item);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.original_filename || `${item.title || 'reading-material'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    handleApiError(err);
  }
}

watch(() => keyword.value, () => {
  page.value = 1;
  refresh();
});

onMounted(refresh);
</script>
