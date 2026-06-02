<template>
  <section class="card management-page text-page course-study-page">
    <div class="management-header">
      <div>
        <h2>课文学习</h2>
      </div>
      <div class="toolbar management-toolbar">
        <div class="toolbar-left">
          <select v-model.number="filters.textbookId">
            <option v-for="textbook in textbooks" :key="textbook.id" :value="textbook.id">{{ textbook.name }}</option>
          </select>
          <button class="ghost" @click="toggleIdOrder" :disabled="loading">
            {{ idOrder === 'asc' ? '倒序查看' : '顺序查看' }}
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
        <table class="table text-table">
          <thead>
            <tr>
              <th>课</th>
              <th>单元</th>
              <th>课文名称</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in rows" :key="item.id">
              <td>
                <span class="course-study-index-text">
                  <span>第</span>
                  <span class="course-study-index-number">{{ item.lesson_number || '-' }}</span>
                  <span>课</span>
                </span>
              </td>
              <td>
                <span class="course-study-index-text">
                  <span>第</span>
                  <span class="course-study-index-number">{{ item.unit_number || '-' }}</span>
                  <span>单元</span>
                </span>
              </td>
              <td>
                <span class="text-entry-title course-study-title" :title="item.title">{{ item.title }}</span>
              </td>
              <td class="actions">
                <button @click="notifyPending">开始学习</button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="4" class="empty">暂无课文条目</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="study-footer-bar">
      <span class="muted study-footer-total">共 {{ total }} 条</span>
      <div class="pagination management-inline-pagination study-footer-pagination">
        <button class="ghost" :disabled="page === 1 || loading" @click="changePage(page - 1)">上一页</button>
        <label class="management-pagination-jump" for="course-study-page-jump">
          第
          <input
            id="course-study-page-jump"
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
      <span class="study-footer-spacer" aria-hidden="true"></span>
    </div>

    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest, ApiError } from '../utils/apiClient';
import { useAuth } from '../composables/useAuth';

const { logout } = useAuth();
const router = useRouter();

const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(50);
const pageJump = ref(1);
const idOrder = ref('asc');
const loading = ref(false);
const error = ref('');
const options = ref({ textbooks: [] });
const toast = reactive({ visible: false, message: '', type: 'info' });

const filters = reactive({
  textbookId: 0
});

const textbooks = computed(() => options.value.textbooks || []);
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

async function loadOptions() {
  const data = await apiRequest('/api/user/texts/options');
  options.value = data || { textbooks: [] };
  if (!filters.textbookId && textbooks.value.length) {
    filters.textbookId = textbooks.value[0].id;
  }
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/api/user/texts', {
      params: {
        limit: pageSize.value,
        offset: (page.value - 1) * pageSize.value,
        textbookId: filters.textbookId || '',
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

function notifyPending() {
  showToast('开始学习功能暂未开放');
}

watch(() => filters.textbookId, () => {
  page.value = 1;
  refresh();
});

onMounted(async () => {
  try {
    await loadOptions();
    await refresh();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  }
});
</script>
