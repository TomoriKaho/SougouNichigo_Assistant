<template>
  <section class="card feedback-page management-page">
    <div class="management-header">
      <div>
        <h2>反馈查看</h2>
      </div>
      <div class="toolbar management-toolbar">
        <div class="toolbar-left">
          <span class="muted feedback-total-inline">共 {{ total }} 条</span>
          <input v-model.trim="keyword" placeholder="搜索内容/类型/ID" @keydown.enter.prevent="refresh" />
          <select v-model="feedbackTypeFilter">
            <option value="all">全部类型</option>
            <option v-for="type in feedbackTypes" :key="type" :value="type">{{ type }}</option>
          </select>
          <button class="ghost" @click="refresh" :disabled="loading">刷新</button>
        </div>
        <div class="management-actions">
          <div class="pagination inline-pagination management-inline-pagination">
            <template v-if="total > pageSize">
              <button class="ghost" :disabled="page === 1 || loading" @click="changePage(page - 1)">上一页</button>
              <label class="management-pagination-jump" for="feedback-page-jump">
                第
                <input
                  id="feedback-page-jump"
                  v-model.number="pageJump"
                  class="page-jump-input management-page-number-input"
                  type="number"
                  min="1"
                  :max="totalPages"
                  @keydown.enter.prevent="jumpToPage"
                  @blur="jumpToPage"
                />
                / {{ totalPages }} 页
              </label>
              <button class="ghost" :disabled="page === totalPages || loading" @click="changePage(page + 1)">下一页</button>
            </template>
          </div>
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
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>用户ID</th>
              <th>反馈类型</th>
              <th>反馈内容</th>
              <th>反馈时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in feedbackList" :key="item.id">
              <td>{{ item.id }}</td>
              <td>{{ item.user_id }}</td>
              <td><span class="tag info">{{ item.feedback_type }}</span></td>
              <td>{{ (item.content || '-').slice(0, 80) }}</td>
              <td>{{ formatDate(item.created_at) }}</td>
              <td>
                <button class="ghost" @click="openDetail(item)">详情</button>
                <button class="danger" @click="confirmDelete(item)" :disabled="deleting">删除</button>
              </td>
            </tr>
            <tr v-if="!feedbackList.length">
              <td colspan="6" class="empty">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="drawerOpen" class="overlay">
      <div class="drawer">
        <header>
          <h3>反馈详情</h3>
          <button class="ghost" @click="closeDrawer">关闭</button>
        </header>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">用户ID</span>
            <span class="detail-value">{{ detail.user_id }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">反馈类型</span>
            <span class="detail-value">{{ detail.feedback_type }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">反馈时间</span>
            <span class="detail-value">{{ formatDate(detail.created_at) }}</span>
          </div>
          <div class="detail-item detail-span">
            <span class="detail-label">反馈内容</span>
            <span class="detail-value muted">{{ detail.content || '-' }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="deleteDialog" class="overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>确认删除</h3>
          <button class="ghost" @click="closeDelete">关闭</button>
        </div>
        <p>即将删除反馈：<strong>{{ deleteDialog.id }}</strong></p>
        <div class="modal-actions">
          <button class="ghost" @click="closeDelete">取消</button>
          <button class="danger" :disabled="deleting" @click="submitDelete">确认删除</button>
        </div>
      </div>
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

const feedbackTypes = ['内容错误', '页面交互', '新功能请求', '其他'];
const feedbackList = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const pageJump = ref(1);
const keyword = ref('');
const feedbackTypeFilter = ref('all');
const loading = ref(false);
const error = ref('');
const drawerOpen = ref(false);
const deleting = ref(false);
const deleteDialog = ref(null);
const toast = reactive({ visible: false, message: '', type: 'info' });
const detail = reactive({
  id: null,
  user_id: '',
  feedback_type: '',
  content: '',
  created_at: ''
});

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

function showToast(message, type = 'info') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  setTimeout(() => (toast.visible = false), 3000);
}

function handleApiError(err) {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      showToast('登录已过期', 'error');
      logout();
      router.push({ name: 'Login' });
      return;
    }
    showToast(err.message || '操作失败', 'error');
    return;
  }
  showToast('网络异常：无法连接到服务器', 'error');
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/feedback', {
      params: {
        limit: pageSize.value,
        offset: (page.value - 1) * pageSize.value,
        keyword: keyword.value,
        feedbackType: feedbackTypeFilter.value
      }
    });
    feedbackList.value = data.feedbackList || [];
    total.value = data.total || 0;
    pageJump.value = page.value;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败';
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

function formatDate(value) {
  return value ? String(value).replace('T', ' ').slice(0, 19) : '-';
}

async function openDetail(item) {
  try {
    const data = await apiRequest(`/feedback/${item.id}`);
    Object.assign(detail, {
      id: data.id,
      user_id: data.user_id,
      feedback_type: data.feedback_type,
      content: data.content,
      created_at: data.created_at
    });
    drawerOpen.value = true;
  } catch (err) {
    handleApiError(err);
  }
}

function closeDrawer() {
  drawerOpen.value = false;
}

function confirmDelete(item) {
  deleteDialog.value = item;
}

function closeDelete() {
  deleteDialog.value = null;
}

async function submitDelete() {
  if (!deleteDialog.value) return;
  deleting.value = true;
  try {
    await apiRequest(`/feedback/${deleteDialog.value.id}`, { method: 'DELETE' });
    showToast('反馈已删除', 'success');
    closeDelete();
    await refresh();
  } catch (err) {
    handleApiError(err);
  } finally {
    deleting.value = false;
  }
}

watch([keyword, feedbackTypeFilter], () => {
  page.value = 1;
  refresh();
});

onMounted(refresh);
</script>
