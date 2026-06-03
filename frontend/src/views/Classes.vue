<template>
  <section class="card management-page classes-page">
    <div class="management-header">
      <div>
        <h2>{{ isTeacher ? '班级管理' : '进入班级' }}</h2>
        <p class="muted total-count">共 {{ total }} 个班级</p>
      </div>
      <div class="toolbar management-toolbar">
        <div class="toolbar-left">
          <button class="ghost" @click="refresh" :disabled="loading">刷新</button>
        </div>
        <div class="toolbar-right">
          <button v-if="isTeacher" type="button" @click="openCreateDialog">创建新班级</button>
          <button type="button" @click="openJoinDialog">加入新班级</button>
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
        <table class="table classes-table">
          <thead>
            <tr>
              <th>班级名</th>
              <th>{{ isTeacher ? '班级代码' : '教师' }}</th>
              <th>{{ isTeacher ? '学生数' : '课程资料数' }}</th>
              <th>{{ isTeacher ? '课程资料数' : '加入时间' }}</th>
              <th v-if="isTeacher">创建时间</th>
              <th class="classes-actions-header">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in rows" :key="item.id">
              <td>
                <span class="classroom-name-inline">
                  <span class="classroom-name-text" :title="item.name">{{ item.name }}</span>
                  <button
                    v-if="isTeacher && item.is_creator"
                    class="ghost classroom-name-edit-button"
                    type="button"
                    @click="openRenameDialog(item)"
                  >
                    修改
                  </button>
                </span>
              </td>
              <td>
                <template v-if="isTeacher">
                  <span class="classroom-code-inline">
                    <span>{{ item.code }}</span>
                    <button class="ghost classroom-code-copy-button" type="button" @click="copyClassCode(item)">复制</button>
                  </span>
                </template>
                <template v-else>
                  {{ item.teacher_username || '-' }}
                </template>
              </td>
              <td>{{ isTeacher ? `${item.student_count || 0} 人` : `${item.material_count || 0} 份` }}</td>
              <td>{{ isTeacher ? `${item.material_count || 0} 份` : formatDateDay(item.joined_at || item.created_at) }}</td>
              <td v-if="isTeacher">{{ formatDateDay(item.created_at) }}</td>
              <td class="actions classes-actions-cell">
                <button class="ghost" type="button" @click="enterClassroom(item)">进入班级</button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td :colspan="isTeacher ? 6 : 5" class="empty">{{ isTeacher ? '暂无已加入或已创建班级' : '暂无已加入班级' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="pagination management-inline-pagination">
      <button class="ghost" :disabled="page === 1 || loading" @click="changePage(page - 1)">上一页</button>
      <label class="management-pagination-jump" for="classes-page-jump">
        第
        <input
          id="classes-page-jump"
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

    <div v-if="createDialogOpen" class="overlay">
      <div class="modal classroom-modal">
        <div class="modal-header">
          <h3>创建新班级</h3>
          <button class="ghost" type="button" @click="closeCreateDialog">关闭</button>
        </div>
        <form @submit.prevent="submitCreateClass">
          <label>
            班级名
            <input v-model.trim="createForm.name" maxlength="64" placeholder="例如：基础日语（四）26春" />
          </label>
          <p class="muted">班级名称不得超过20个字。</p>
          <p v-if="modalError" class="error">{{ modalError }}</p>
          <div class="modal-actions">
            <button class="ghost" type="button" @click="closeCreateDialog">取消</button>
            <button type="submit" :disabled="saving">{{ saving ? '创建中...' : '确认创建' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="joinDialogOpen" class="overlay">
      <div class="modal classroom-modal">
        <div class="modal-header">
          <h3>加入新班级</h3>
          <button class="ghost" type="button" @click="closeJoinDialog">关闭</button>
        </div>
        <form @submit.prevent="submitJoinClass">
          <label>
            班级代码
            <input v-model.trim="joinForm.code" maxlength="16" placeholder="请输入教师提供的班级码" />
          </label>
          <p v-if="modalError" class="error">{{ modalError }}</p>
          <div class="modal-actions">
            <button class="ghost" type="button" @click="closeJoinDialog">取消</button>
            <button type="submit" :disabled="saving">{{ saving ? '加入中...' : '确认加入' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="renameDialogOpen" class="overlay">
      <div class="modal classroom-modal">
        <div class="modal-header">
          <h3>修改班级名</h3>
          <button class="ghost" type="button" @click="closeRenameDialog">关闭</button>
        </div>
        <form @submit.prevent="submitRenameClass">
          <label>
            班级名
            <input v-model.trim="renameForm.name" maxlength="64" />
          </label>
          <p class="muted">班级名称不得超过20个字。</p>
          <p v-if="renameError" class="error">{{ renameError }}</p>
          <div class="modal-actions">
            <button class="ghost" type="button" @click="closeRenameDialog">取消</button>
            <button type="submit" :disabled="saving">{{ saving ? '保存中...' : '确认保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="dissolveDialog" class="overlay">
      <div class="modal warning classroom-modal">
        <div class="modal-header">
          <h3>确认解散班级</h3>
          <button class="ghost" type="button" @click="closeDissolveDialog">关闭</button>
        </div>
        <p>即将解散班级：<strong>{{ dissolveDialog.name }}</strong></p>
        <p class="muted">解散后，班级和学生加入记录都会被删除。</p>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeDissolveDialog">取消</button>
          <button class="danger" type="button" :disabled="saving" @click="submitDissolveClass">
            {{ saving ? '解散中...' : '确认解散' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest, ApiError } from '../utils/apiClient';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const { logout, isTeacher } = useAuth();

const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const pageJump = ref(1);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const modalError = ref('');
const createDialogOpen = ref(false);
const joinDialogOpen = ref(false);
const renameDialogOpen = ref(false);
const dissolveDialog = ref(null);
const toast = reactive({ visible: false, message: '', type: 'info' });

const createForm = reactive({ name: '' });
const joinForm = reactive({ code: '' });
const renameForm = reactive({ name: '' });
const renameError = ref('');
const renameTargetId = ref(null);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

function textDisplayWidth(value) {
  return Array.from(String(value || '')).reduce((total, char) => total + (/[\u0000-\u00ff]/.test(char) ? 1 : 2), 0);
}

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

function formatDateTime(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
}

function formatDateDay(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 10);
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/api/user/classes', {
      params: {
        limit: pageSize.value,
        offset: (page.value - 1) * pageSize.value
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

function openCreateDialog() {
  createForm.name = '';
  modalError.value = '';
  createDialogOpen.value = true;
}

function closeCreateDialog() {
  createDialogOpen.value = false;
  modalError.value = '';
}

function openJoinDialog() {
  joinForm.code = '';
  modalError.value = '';
  joinDialogOpen.value = true;
}

function closeJoinDialog() {
  joinDialogOpen.value = false;
  modalError.value = '';
}

function openRenameDialog(item) {
  renameTargetId.value = item.id;
  renameForm.name = item.name || '';
  renameError.value = '';
  renameDialogOpen.value = true;
}

function closeRenameDialog() {
  renameDialogOpen.value = false;
  renameError.value = '';
  renameTargetId.value = null;
}

function confirmDissolve(item) {
  dissolveDialog.value = item;
  modalError.value = '';
}

function closeDissolveDialog() {
  dissolveDialog.value = null;
}

async function submitCreateClass() {
  modalError.value = '';
  if (!createForm.name.trim()) {
    modalError.value = '请输入班级名';
    return;
  }
  if (textDisplayWidth(createForm.name.trim()) > 40) {
    modalError.value = '班级名称不得超过20个字';
    return;
  }

  saving.value = true;
  try {
    await apiRequest('/api/user/classes', {
      method: 'POST',
      body: { name: createForm.name.trim() }
    });
    closeCreateDialog();
    page.value = 1;
    await refresh();
    showToast('班级已创建', 'success');
  } catch (err) {
    if (err instanceof ApiError && err.status !== 401) {
      modalError.value = err.message;
    }
    handleApiError(err);
  } finally {
    saving.value = false;
  }
}

async function submitJoinClass() {
  modalError.value = '';
  if (!joinForm.code.trim()) {
    modalError.value = '请输入班级代码';
    return;
  }

  saving.value = true;
  try {
    await apiRequest('/api/user/classes/join', {
      method: 'POST',
      body: { code: joinForm.code.trim() }
    });
    closeJoinDialog();
    page.value = 1;
    await refresh();
    showToast('已加入班级', 'success');
  } catch (err) {
    if (err instanceof ApiError && err.status !== 401) {
      modalError.value = err.message;
    }
    handleApiError(err);
  } finally {
    saving.value = false;
  }
}

async function submitRenameClass() {
  renameError.value = '';
  if (!renameTargetId.value) return;
  if (!renameForm.name.trim()) {
    renameError.value = '请输入班级名';
    return;
  }
  if (textDisplayWidth(renameForm.name.trim()) > 40) {
    renameError.value = '班级名称不得超过20个字';
    return;
  }

  saving.value = true;
  try {
    await apiRequest(`/api/user/classes/${renameTargetId.value}`, {
      method: 'PUT',
      body: { name: renameForm.name.trim() }
    });
    closeRenameDialog();
    await refresh();
    showToast('班级名称已更新', 'success');
  } catch (err) {
    if (err instanceof ApiError && err.status !== 401) {
      renameError.value = err.message;
    }
    handleApiError(err);
  } finally {
    saving.value = false;
  }
}

async function submitDissolveClass() {
  if (!dissolveDialog.value) return;

  saving.value = true;
  try {
    await apiRequest(`/api/user/classes/${dissolveDialog.value.id}`, {
      method: 'DELETE'
    });
    closeDissolveDialog();
    await refresh();
    showToast('班级已解散', 'success');
  } catch (err) {
    handleApiError(err);
  } finally {
    saving.value = false;
  }
}

async function copyClassCode(item) {
  try {
    await navigator.clipboard.writeText(item.code || '');
    showToast(`班级码已复制：${item.code}`, 'success');
  } catch (error) {
    showToast(`复制失败，请手动记录：${item.code}`, 'error');
  }
}

function enterClassroom(item) {
  router.push({ name: 'ClassDetail', params: { id: item.id } });
}

onMounted(refresh);
</script>
