<template>
  <section class="card management-page text-page">
    <div class="management-header">
      <div>
        <h2>课文管理</h2>
        <p class="muted total-count">共 {{ total }} 条</p>
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
        <div class="toolbar-right">
          <button @click="openCreate">新建课文</button>
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
              <td>第{{ item.lesson_number || '-' }}课</td>
              <td>第{{ item.unit_number || '-' }}单元</td>
              <td>
                <span class="text-entry-title" :title="item.title">{{ item.title }}</span>
              </td>
              <td class="actions">
                <button class="ghost" @click="openEdit(item)">编辑详情</button>
                <button class="danger" @click="confirmDelete(item)">删除</button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="4" class="empty">暂无课文条目</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="pagination management-inline-pagination">
      <button class="ghost" :disabled="page === 1 || loading" @click="changePage(page - 1)">上一页</button>
      <label class="management-pagination-jump" for="text-page-jump">
        第
        <input
          id="text-page-jump"
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

    <div v-if="drawerOpen" class="overlay">
      <div class="drawer text-edit-drawer">
        <header>
          <h3>{{ editingId ? '编辑课文详情' : '新建课文' }}</h3>
          <div class="drawer-header-actions">
            <button type="submit" form="text-edit-form" :disabled="saving">保存</button>
            <button class="ghost" @click="closeDrawer">关闭</button>
          </div>
        </header>
        <div class="drawer-body">
          <form id="text-edit-form" class="scroll-form" @submit.prevent="submitSave">
            <template v-if="!editingId">
              <label>
                教材
                <select v-model.number="createContext.textbook_id">
                  <option v-for="textbook in textbooks" :key="textbook.id" :value="textbook.id">{{ textbook.name }}</option>
                </select>
              </label>
            </template>

            <div v-else class="detail-grid text-context-grid">
              <div class="detail-item">
                <span class="detail-label">教材</span>
                <span class="detail-value">{{ activeEntry?.textbook_name || '-' }}</span>
              </div>
            </div>

            <div class="drawer-inline-row drawer-field-row">
              <label class="drawer-field">
                课
                <input v-model.number="form.lesson_number" type="number" min="0" />
              </label>
              <label class="drawer-field">
                单元
                <input v-model.number="form.unit_number" type="number" min="0" />
              </label>
            </div>

            <label>
              课文名称
              <input v-model="form.title" />
              <span v-if="formErrors.title" class="field-error">{{ formErrors.title }}</span>
            </label>

            <label>
              课文内容
              <textarea v-model="form.content" rows="18"></textarea>
            </label>
          </form>
        </div>
      </div>
    </div>

    <div v-if="deleteDialog" class="overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>确认删除</h3>
          <button class="ghost" @click="closeDelete">关闭</button>
        </div>
        <p>即将删除课文：<strong>{{ deleteDialog.title || deleteDialog.id }}</strong></p>
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

const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(50);
const pageJump = ref(1);
const idOrder = ref('asc');
const loading = ref(false);
const error = ref('');
const options = ref({ textbooks: [] });
const drawerOpen = ref(false);
const editingId = ref(null);
const activeEntry = ref(null);
const saving = ref(false);
const deleting = ref(false);
const deleteDialog = ref(null);
const toast = reactive({ visible: false, message: '', type: 'info' });

const filters = reactive({
  textbookId: 0
});

const form = reactive({
  lesson_number: 0,
  unit_number: 0,
  title: '',
  content: ''
});
const formErrors = reactive({ title: '' });

const createContext = reactive({
  textbook_id: 0
});

const textbooks = computed(() => options.value.textbooks || []);
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

function resetForm() {
  form.lesson_number = 0;
  form.unit_number = 0;
  form.title = '';
  form.content = '';
  formErrors.title = '';
}

function fillCreateDefaults() {
  createContext.textbook_id = textbooks.value[0]?.id || 0;
}

async function loadOptions() {
  const data = await apiRequest('/texts/options');
  options.value = data || { textbooks: [] };
  if (!filters.textbookId && textbooks.value.length) {
    filters.textbookId = textbooks.value[0].id;
  }
  fillCreateDefaults();
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/texts', {
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

function openCreate() {
  resetForm();
  fillCreateDefaults();
  activeEntry.value = null;
  editingId.value = null;
  drawerOpen.value = true;
}

async function openEdit(item) {
  try {
    const data = await apiRequest(`/texts/${item.id}`);
    activeEntry.value = data;
    editingId.value = data.id;
    form.lesson_number = data.lesson_number || 0;
    form.unit_number = data.unit_number || 0;
    form.title = data.title || '';
    form.content = data.content || '';
    formErrors.title = '';
    drawerOpen.value = true;
  } catch (err) {
    handleApiError(err);
  }
}

function closeDrawer() {
  drawerOpen.value = false;
  activeEntry.value = null;
  editingId.value = null;
}

function validateForm() {
  formErrors.title = '';
  if (!form.title.trim()) formErrors.title = '请输入课文名称';
  if (!editingId.value && !createContext.textbook_id) {
    showToast('请选择教材', 'error');
    return false;
  }
  return !formErrors.title;
}

function payloadFromForm() {
  return {
    lesson_number: Number(form.lesson_number || 0),
    unit_number: Number(form.unit_number || 0),
    title: form.title.trim(),
    content: form.content.trim() || null
  };
}

async function submitSave() {
  if (!validateForm()) return;
  saving.value = true;
  try {
    if (editingId.value) {
      await apiRequest(`/texts/${editingId.value}`, {
        method: 'PUT',
        body: payloadFromForm()
      });
      showToast('课文已更新', 'success');
    } else {
      await apiRequest('/texts', {
        method: 'POST',
        body: {
          ...payloadFromForm(),
          textbook_id: createContext.textbook_id
        }
      });
      showToast('课文已创建', 'success');
    }
    closeDrawer();
    await refresh();
  } catch (err) {
    handleApiError(err);
  } finally {
    saving.value = false;
  }
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
    await apiRequest(`/texts/${deleteDialog.value.id}`, { method: 'DELETE' });
    showToast('课文已删除', 'success');
    closeDelete();
    await refresh();
  } catch (err) {
    handleApiError(err);
  } finally {
    deleting.value = false;
  }
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
  }
});
</script>
