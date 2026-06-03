<template>
  <section class="card users-page management-page">
    <div class="management-header">
      <div>
        <h2>用户管理</h2>
      </div>
      <div class="toolbar management-toolbar">
        <div class="toolbar-left">
          <input v-model.trim="keyword" placeholder="搜索邮箱/用户名/ID" @keydown.enter.prevent="refresh" />
          <select v-model="roleFilter">
            <option value="all">全部角色</option>
            <option v-if="isDev" value="dev">DEV</option>
            <option value="admin">ADMIN</option>
            <option value="user">USER</option>
          </select>
          <button class="ghost" @click="refresh" :disabled="loading">刷新</button>
        </div>
        <div class="management-actions">
          <div class="pagination inline-pagination management-inline-pagination">
            <span class="muted management-pagination-total">共 {{ total }} 条</span>
            <template v-if="total > pageSize">
              <button class="ghost" :disabled="page === 1 || loading" @click="changePage(page - 1)">上一页</button>
              <label class="management-pagination-jump" for="users-page-jump">
                第
                <input
                  id="users-page-jump"
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
          <button @click="openCreate">新建用户</button>
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
              <th class="col-id">ID</th>
              <th class="col-email">邮箱</th>
              <th class="col-username">用户名</th>
              <th class="col-type">类型</th>
              <th class="col-type">年级</th>
              <th class="col-role">角色</th>
              <th class="col-created-at">创建时间</th>
              <th class="col-actions"><span class="col-actions-label">操作</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td class="col-id">{{ user.id }}</td>
              <td class="col-email">{{ user.email || '-' }}</td>
              <td class="col-username">{{ user.username || '-' }}</td>
              <td class="col-type">
                <span class="tag" :class="typeTagClass(user.user_type)">{{ userTypeLabel(user.user_type) }}</span>
              </td>
              <td class="col-type">{{ gradeLabel(user.grade) }}</td>
              <td class="col-role">
                <span class="tag" :class="user.role">{{ roleLabel(user.role) }}</span>
              </td>
              <td class="col-created-at">{{ formatDate(user.created_at) }}</td>
              <td class="actions">
                <div class="actions-group">
                  <button class="ghost" :disabled="!canEdit(user)" :title="editDisabledReason(user)" @click="openEdit(user)">编辑</button>
                  <button class="danger" :disabled="!canDelete(user)" :title="deleteDisabledReason(user)" @click="confirmDelete(user)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="!users.length">
              <td colspan="8" class="empty">暂无用户数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="drawerOpen" class="overlay">
      <div class="drawer">
        <header>
          <h3>编辑用户</h3>
          <button class="ghost" @click="closeDrawer">关闭</button>
        </header>
        <form @submit.prevent="submitEdit">
          <label>
            邮箱
            <input v-model="form.email" type="email" />
            <span v-if="formErrors.email" class="field-error">{{ formErrors.email }}</span>
          </label>
          <label>
            用户名
            <input v-model="form.username" />
            <span v-if="formErrors.username" class="field-error">{{ formErrors.username }}</span>
          </label>
          <label>
            重置密码
            <input v-model="form.password" type="password" />
            <span v-if="formErrors.password" class="field-error">{{ formErrors.password }}</span>
          </label>
          <label>
            角色
            <select v-model="form.role" :disabled="!canEditRole(activeUser)" :title="roleDisabledReason(activeUser)">
              <option v-for="role in roleOptions(activeUser)" :key="role" :value="role">{{ roleLabel(role) }}</option>
            </select>
            <span v-if="roleHelp" class="hint">{{ roleHelp }}</span>
          </label>
          <label>
            类型
            <select v-model="form.user_type" @change="handleEditUserTypeChange">
              <option v-for="type in userTypeOptions" :key="type" :value="type">{{ userTypeLabel(type) }}</option>
            </select>
          </label>
          <label>
            年级
            <select v-model="form.grade" :disabled="form.user_type === 'teacher'">
              <option v-if="form.user_type === 'teacher'" value="教师">教师</option>
              <option v-else value="">请选择年级</option>
              <option v-for="grade in studentGradeOptions" :key="grade" :value="grade">{{ grade }}</option>
            </select>
            <span v-if="formErrors.grade" class="field-error">{{ formErrors.grade }}</span>
          </label>
          <div class="edit-drawer-actions">
            <button type="button" class="ghost" :disabled="saving" @click="closeDrawer">不保存</button>
            <button type="submit" :disabled="saving">保存</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="createOpen" class="overlay">
      <div class="drawer">
        <header>
          <h3>新建用户</h3>
          <button class="ghost" @click="closeCreate">关闭</button>
        </header>
        <form @submit.prevent="submitCreate">
          <label>
            邮箱
            <input v-model="createForm.email" type="email" />
            <span v-if="createErrors.email" class="field-error">{{ createErrors.email }}</span>
          </label>
          <label>
            用户名
            <input v-model="createForm.username" />
            <span v-if="createErrors.username" class="field-error">{{ createErrors.username }}</span>
          </label>
          <label>
            密码
            <input v-model="createForm.password" type="password" />
            <span v-if="createErrors.password" class="field-error">{{ createErrors.password }}</span>
          </label>
          <label>
            角色
            <select v-model="createForm.role">
              <option v-for="role in createRoleOptions" :key="role" :value="role">{{ roleLabel(role) }}</option>
            </select>
          </label>
          <label>
            类型
            <select v-model="createForm.user_type" @change="handleCreateUserTypeChange">
              <option v-for="type in userTypeOptions" :key="type" :value="type">{{ userTypeLabel(type) }}</option>
            </select>
          </label>
          <label>
            年级
            <select v-model="createForm.grade" :disabled="createForm.user_type === 'teacher'">
              <option v-if="createForm.user_type === 'teacher'" value="教师">教师</option>
              <option v-else value="">请选择年级</option>
              <option v-for="grade in studentGradeOptions" :key="grade" :value="grade">{{ grade }}</option>
            </select>
            <span v-if="createErrors.grade" class="field-error">{{ createErrors.grade }}</span>
          </label>
          <button type="submit" :disabled="creating">创建</button>
        </form>
      </div>
    </div>

    <div v-if="deleteDialog" class="overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>确认删除</h3>
          <button class="ghost" @click="closeDelete">关闭</button>
        </div>
        <p>即将删除用户：<strong>{{ deleteDialog.username || deleteDialog.email || deleteDialog.id }}</strong></p>
        <p class="muted">删除后账号无法恢复。</p>
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

const { state, isDev, logout, fetchMe } = useAuth();
const router = useRouter();

const users = ref([]);
const total = ref(0);
const page = ref(1);
const pageJump = ref(1);
const pageSize = ref(20);
const keyword = ref('');
const roleFilter = ref('all');
const loading = ref(false);
const error = ref('');
const drawerOpen = ref(false);
const createOpen = ref(false);
const saving = ref(false);
const creating = ref(false);
const deleting = ref(false);
const activeUser = ref(null);
const deleteDialog = ref(null);
const toast = reactive({ visible: false, message: '', type: 'info' });

const userTypeOptions = ['student', 'teacher'];
const studentGradeOptions = ['大一上', '大一下', '大二上', '大二下', '高年级'];
const createRoleOptions = computed(() => (isDev.value ? ['user', 'admin', 'dev'] : ['user', 'admin']));
const currentUserId = computed(() => Number(state.user?.id || 0));
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const roleHelp = computed(() => {
  if (!activeUser.value) return '';
  return roleDisabledReason(activeUser.value);
});

const form = reactive({ email: '', username: '', password: '', role: 'user', user_type: 'student', grade: '' });
const formErrors = reactive({ email: '', username: '', password: '', grade: '' });
const createForm = reactive({ email: '', username: '', password: '', role: 'user', user_type: 'student', grade: '' });
const createErrors = reactive({ email: '', username: '', password: '', grade: '' });

function showToast(message, type = 'info') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  setTimeout(() => (toast.visible = false), 1600);
}

function resetErrors(target) {
  Object.keys(target).forEach((key) => (target[key] = ''));
}

function handleApiError(err, targetErrors) {
  if (err instanceof ApiError) {
    if ([400, 409, 422].includes(err.status)) {
      if (targetErrors) resetErrors(targetErrors);
      if (err.fieldErrors && targetErrors) Object.assign(targetErrors, err.fieldErrors);
      showToast(err.message || '请检查表单字段', 'error');
      return;
    }
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
    const data = await apiRequest('/users', {
      params: {
        limit: pageSize.value,
        offset: (page.value - 1) * pageSize.value,
        role: roleFilter.value,
        keyword: keyword.value
      }
    });
    users.value = data.rows || [];
    total.value = data.total || 0;
    pageJump.value = page.value;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败';
    if (err instanceof ApiError && err.status === 401) {
      logout();
      router.push({ name: 'Login' });
    }
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

function roleLabel(role) {
  if (role === 'dev') return 'DEV';
  if (role === 'admin') return 'ADMIN';
  if (role === 'user') return 'USER';
  return role || '-';
}

function userTypeLabel(type) {
  if (type === 'teacher') return '教师用户';
  if (type === 'student') return '学生用户';
  return type || '-';
}

function gradeLabel(grade) {
  return grade || '-';
}

function typeTagClass(type) {
  return type === 'teacher' ? 'success' : 'info';
}

function normalizeGradeForForm(userType, grade) {
  if (userType === 'teacher') return '教师';
  return studentGradeOptions.includes(grade) ? grade : '';
}

function canEdit(user) {
  if (!user) return false;
  if (isDev.value) return true;
  return user.role !== 'dev' && !user.is_initial_dev;
}

function editDisabledReason(user) {
  if (canEdit(user)) return '';
  return 'admin 不能编辑 dev 用户';
}

function canDelete(user) {
  if (!user) return false;
  if (Number(user.id) === currentUserId.value) return false;
  if (user.is_initial_dev) return false;
  if (isDev.value) return true;
  return user.role !== 'dev';
}

function deleteDisabledReason(user) {
  if (canDelete(user)) return '';
  if (Number(user?.id) === currentUserId.value) return '不能删除当前登录用户';
  if (user?.role === 'dev' || user?.is_initial_dev) return 'admin 不能删除 dev 用户';
  return '不可删除';
}

function canEditRole(user) {
  if (!user) return false;
  if (isDev.value) return true;
  if (user.role === 'dev' || user.is_initial_dev) return false;
  if (Number(user.id) === currentUserId.value && user.role === 'admin') return false;
  return true;
}

function roleDisabledReason(user) {
  if (!user) return '';
  if (isDev.value) return '';
  if (user.role === 'dev' || user.is_initial_dev) return 'admin 不能修改 dev 用户';
  if (Number(user.id) === currentUserId.value && user.role === 'admin') return 'admin 不能降级自己';
  return '';
}

function roleOptions(user) {
  if (!user) return createRoleOptions.value;
  if (isDev.value) return ['user', 'admin', 'dev'];
  if (user.role === 'admin') return ['admin'];
  return ['user', 'admin'];
}

function openEdit(user) {
  if (!canEdit(user)) return;
  activeUser.value = user;
  form.email = user.email || '';
  form.username = user.username || '';
  form.password = '';
  form.role = user.role || 'user';
  form.user_type = user.user_type || 'student';
  form.grade = normalizeGradeForForm(form.user_type, user.grade);
  resetErrors(formErrors);
  drawerOpen.value = true;
}

function closeDrawer() {
  drawerOpen.value = false;
  activeUser.value = null;
}

function openCreate() {
  createForm.email = '';
  createForm.username = '';
  createForm.password = '';
  createForm.role = 'user';
  createForm.user_type = 'student';
  createForm.grade = '';
  resetErrors(createErrors);
  createOpen.value = true;
}

function closeCreate() {
  createOpen.value = false;
}

function validateUserForm(target, errors, isCreate) {
  resetErrors(errors);
  if (!target.username.trim()) errors.username = '请输入用户名';
  if (isCreate && !target.password.trim()) errors.password = '请输入密码';
  if (target.user_type === 'student' && !target.grade) errors.grade = '学生用户请选择年级';
  return !Object.values(errors).some(Boolean);
}

function handleEditUserTypeChange() {
  form.grade = normalizeGradeForForm(form.user_type, form.grade);
}

function handleCreateUserTypeChange() {
  createForm.grade = normalizeGradeForForm(createForm.user_type, createForm.grade);
}

async function submitEdit() {
  if (!activeUser.value || !validateUserForm(form, formErrors, false)) return;
  const editedCurrentUser = Number(activeUser.value.id) === currentUserId.value;
  saving.value = true;
  try {
    await apiRequest(`/users/${activeUser.value.id}`, {
      method: 'PUT',
      body: {
        email: form.email.trim() || null,
        username: form.username.trim(),
        password: form.password || undefined,
        role: form.role,
        user_type: form.user_type,
        grade: form.user_type === 'teacher' ? '教师' : form.grade
      }
    });
    showToast('用户已更新', 'success');
    closeDrawer();
    await refresh();
    if (editedCurrentUser) await fetchMe();
  } catch (err) {
    handleApiError(err, formErrors);
  } finally {
    saving.value = false;
  }
}

async function submitCreate() {
  if (!validateUserForm(createForm, createErrors, true)) return;
  creating.value = true;
  try {
    await apiRequest('/users', {
      method: 'POST',
      body: {
        email: createForm.email.trim() || null,
        username: createForm.username.trim(),
        password: createForm.password,
        role: createForm.role,
        user_type: createForm.user_type,
        grade: createForm.user_type === 'teacher' ? '教师' : createForm.grade
      }
    });
    showToast('用户已创建', 'success');
    closeCreate();
    page.value = 1;
    await refresh();
  } catch (err) {
    handleApiError(err, createErrors);
  } finally {
    creating.value = false;
  }
}

function confirmDelete(user) {
  if (!canDelete(user)) return;
  deleteDialog.value = user;
}

function closeDelete() {
  deleteDialog.value = null;
}

async function submitDelete() {
  if (!deleteDialog.value) return;
  deleting.value = true;
  try {
    await apiRequest(`/users/${deleteDialog.value.id}`, { method: 'DELETE' });
    showToast('用户已删除', 'success');
    closeDelete();
    await refresh();
  } catch (err) {
    handleApiError(err);
  } finally {
    deleting.value = false;
  }
}

watch([keyword, roleFilter], () => {
  page.value = 1;
  refresh();
});

onMounted(refresh);
</script>
