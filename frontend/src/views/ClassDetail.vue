<template>
  <section class="card class-detail-page">
    <div class="class-detail-header">
      <div>
        <h2>{{ detail?.name || (isTeacher ? '班级详情' : '我的班级') }}</h2>
      </div>
      <div class="class-detail-header-actions">
        <div v-if="detail && activeDetailView === 'materials'" class="class-detail-header-search-tools">
          <input v-model.trim="materialsKeyword" placeholder="搜索标题/文件名" @keydown.enter.prevent="refreshMaterials" />
          <button class="ghost" @click="toggleMaterialsOrder" :disabled="loadingMaterials">
            {{ materialsOrder === 'asc' ? '最新优先' : '最早优先' }}
          </button>
          <button class="ghost" @click="refreshMaterials" :disabled="loadingMaterials">刷新</button>
        </div>
        <button
          v-if="canDissolveClass"
          class="danger"
          type="button"
          @click="confirmDissolveClass"
        >
          解散班级
        </button>
        <button class="ghost" type="button" @click="goBack">返回班级列表</button>
      </div>
    </div>

    <div class="class-detail-content">
      <div v-if="error" class="error-block">
        <p class="error">{{ error }}</p>
        <button class="ghost" @click="reloadAll">重试</button>
      </div>
      <div v-else-if="loadingDetail" class="loading">加载中...</div>
      <template v-else-if="detail">
        <div class="class-detail-panel-shell">
          <div class="class-detail-switch-row">
            <div class="class-detail-tabbar" role="tablist" aria-label="班级详情内容切换">
              <button
                v-for="option in detailViewOptions"
                :key="option.key"
                type="button"
                class="class-detail-tab"
                :class="{ active: activeDetailView === option.key }"
                :aria-selected="activeDetailView === option.key"
                @click="activeDetailView = option.key"
              >
                {{ option.label }}
              </button>
            </div>
            <div class="class-detail-panel-meta">
              <button
                v-if="activeDetailView === 'materials' && canManageMaterials"
                type="button"
                @click="openUploadDialog"
              >
                上传资料
              </button>
              <span v-if="activeDetailView === 'members'" class="muted class-detail-total-text">共 {{ membersTotal }} 人</span>
              <span v-else class="muted class-detail-total-text">共 {{ materialsTotal }} 个文件</span>

              <div
                v-if="activeDetailView === 'members'"
                class="pagination management-inline-pagination class-detail-inline-pagination"
              >
                <button class="ghost" :disabled="membersPage === 1" @click="changeMembersPage(membersPage - 1)">上一页</button>
                <label class="management-pagination-jump" for="class-members-page-jump">
                  第
                  <input
                    id="class-members-page-jump"
                    v-model.number="membersPageJump"
                    class="management-page-number-input"
                    type="number"
                    min="1"
                    :max="membersTotalPages"
                    :disabled="membersTotalPages <= 1"
                    @keydown.enter.prevent="jumpToMembersPage"
                    @blur="jumpToMembersPage"
                  />
                  / {{ membersTotalPages }} 页
                </label>
                <button class="ghost" :disabled="membersPage === membersTotalPages" @click="changeMembersPage(membersPage + 1)">下一页</button>
              </div>

              <div
                v-else
                class="pagination management-inline-pagination class-detail-inline-pagination"
              >
                <button class="ghost" :disabled="materialsPage === 1 || loadingMaterials" @click="changeMaterialsPage(materialsPage - 1)">上一页</button>
                <label class="management-pagination-jump" for="class-materials-page-jump">
                  第
                  <input
                    id="class-materials-page-jump"
                    v-model.number="materialsPageJump"
                    class="management-page-number-input"
                    type="number"
                    min="1"
                    :max="materialsTotalPages"
                    :disabled="materialsTotalPages <= 1 || loadingMaterials"
                    @keydown.enter.prevent="jumpToMaterialsPage"
                    @blur="jumpToMaterialsPage"
                  />
                  / {{ materialsTotalPages }} 页
                </label>
                <button class="ghost" :disabled="materialsPage === materialsTotalPages || loadingMaterials" @click="changeMaterialsPage(materialsPage + 1)">下一页</button>
              </div>
            </div>
          </div>

          <section v-show="activeDetailView === 'members'" class="class-detail-panel class-members-section">
            <div class="management-table-scroll class-detail-table-scroll">
              <table class="table class-members-table">
                <thead>
                  <tr>
                    <th>用户名</th>
                    <th>邮箱</th>
                    <th>身份</th>
                    <th>加入时间</th>
                    <th class="classes-actions-header">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="member in pagedMembers" :key="member.id">
                    <td>{{ member.username || '-' }}</td>
                    <td>{{ member.email || '-' }}</td>
                    <td>{{ memberRoleLabel(member.member_role) }}</td>
                    <td>{{ formatDateTime(member.joined_at) }}</td>
                    <td class="actions classes-actions-cell">
                      <button
                        v-if="isCreator && member.member_role === 'student'"
                        class="danger"
                        type="button"
                        @click="confirmRemoveMember(member)"
                      >
                        移除学生
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!(detail.members || []).length">
                    <td colspan="5" class="empty">暂无成员</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section v-show="activeDetailView === 'materials'" class="class-detail-panel class-materials-section">
            <div v-if="materialsError" class="error-block">
              <p class="error">{{ materialsError }}</p>
              <button class="ghost" @click="refreshMaterials">重试</button>
            </div>
            <div v-else-if="loadingMaterials" class="loading">加载中...</div>
            <div v-else class="management-table-scroll class-detail-table-scroll">
              <table class="table reading-materials-table class-reading-materials-table">
                <thead>
                  <tr>
                    <th>标题</th>
                    <th>上传者</th>
                    <th>文件格式</th>
                    <th>大小</th>
                    <th>上传时间</th>
                    <th class="classes-actions-header">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in materialsRows" :key="item.id">
                    <td>
                      <span class="reading-material-title" :title="item.title">{{ item.title }}</span>
                    </td>
                    <td>{{ item.uploader_username || '-' }}</td>
                    <td>{{ formatMaterialType(item) }}</td>
                    <td>{{ formatFileSize(item.file_size) }}</td>
                    <td>{{ formatDateTime(item.created_at) }}</td>
                    <td class="actions classes-actions-cell">
                      <a
                        v-if="item.can_view && item.view_url"
                        class="ghost table-action-link"
                        :href="item.view_url"
                        target="_blank"
                        rel="noopener"
                      >查看</a>
                      <button v-else class="ghost" disabled title="该文件暂不可在线查看，请下载后打开">查看</button>
                      <button class="ghost" type="button" @click="downloadMaterial(item)">下载</button>
                      <button v-if="canManageMaterials" class="ghost" type="button" @click="openEditDialog(item)">编辑</button>
                      <button v-if="canManageMaterials" class="danger" type="button" @click="confirmDeleteMaterial(item)">删除</button>
                    </td>
                  </tr>
                  <tr v-if="!materialsRows.length">
                    <td colspan="6" class="empty">暂无课程资料</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </template>
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
            <button type="submit" :disabled="savingAction">{{ savingAction ? '保存中...' : '确认保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="removeMemberDialog" class="overlay">
      <div class="modal warning classroom-modal">
        <div class="modal-header">
          <h3>确认移除学生</h3>
          <button class="ghost" type="button" @click="closeRemoveMemberDialog">关闭</button>
        </div>
        <p>即将移除学生：<strong>{{ removeMemberDialog.username }}</strong></p>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeRemoveMemberDialog">取消</button>
          <button class="danger" type="button" :disabled="savingAction" @click="submitRemoveMember">
            {{ savingAction ? '移除中...' : '确认移除' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="dissolveDialogOpen" class="overlay">
      <div class="modal warning classroom-modal">
        <div class="modal-header">
          <h3>确认解散班级</h3>
          <button class="ghost" type="button" @click="closeDissolveDialog">关闭</button>
        </div>
        <p>即将解散班级：<strong>{{ detail?.name }}</strong></p>
        <p class="muted">解散后，班级成员和加入记录都会被删除，班级将不可继续访问。此操作不可恢复。</p>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeDissolveDialog">取消</button>
          <button class="danger" type="button" :disabled="savingAction" @click="submitDissolveClass">
            {{ savingAction ? '解散中...' : '确认解散' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="uploadDialogOpen" class="overlay">
      <div class="modal reading-material-upload-modal">
        <div class="modal-header">
          <h3>上传课程资料</h3>
          <button class="ghost" type="button" @click="closeUploadDialog">关闭</button>
        </div>
        <form @submit.prevent="submitUploadMaterial">
          <label>
            标题
            <input v-model="uploadForm.title" placeholder="不填写时使用文件名" />
          </label>
          <label>
            文件
            <input
              ref="fileInput"
              type="file"
              accept=".html,.htm,text/html,.pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
              @change="handleFileChange"
            />
          </label>
          <p class="muted selected-file-line">
            支持 HTML、图片、PDF 和 Word。HTML 不超过 10MB，图片不超过 20MB，PDF/Word 不超过 200MB。
          </p>
          <p v-if="uploadFile" class="muted selected-file-line">
            {{ uploadFile.name }} / {{ formatFileSize(uploadFile.size) }}
          </p>
          <p v-if="uploadError" class="error">{{ uploadError }}</p>
          <div class="modal-actions">
            <button class="ghost" type="button" @click="closeUploadDialog">取消</button>
            <button type="submit" :disabled="savingAction">{{ savingAction ? '上传中...' : '上传' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="editMaterialDialog" class="overlay">
      <div class="modal classroom-modal">
        <div class="modal-header">
          <h3>编辑课程资料</h3>
          <button class="ghost" type="button" @click="closeEditDialog">关闭</button>
        </div>
        <form @submit.prevent="submitEditMaterial">
          <label>
            标题
            <input v-model.trim="editMaterialForm.title" />
          </label>
          <p v-if="editMaterialError" class="error">{{ editMaterialError }}</p>
          <div class="modal-actions">
            <button class="ghost" type="button" @click="closeEditDialog">取消</button>
            <button type="submit" :disabled="savingAction">{{ savingAction ? '保存中...' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="deleteMaterialDialog" class="overlay">
      <div class="modal warning classroom-modal">
        <div class="modal-header">
          <h3>确认删除课程资料</h3>
          <button class="ghost" type="button" @click="closeDeleteMaterialDialog">关闭</button>
        </div>
        <p>即将删除课程资料：<strong>{{ deleteMaterialDialog.title || deleteMaterialDialog.original_filename }}</strong></p>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeDeleteMaterialDialog">取消</button>
          <button class="danger" type="button" :disabled="savingAction" @click="submitDeleteMaterial">
            {{ savingAction ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiRequest, ApiError, getApiRoot, getAuthToken } from '../utils/apiClient';
import { useAuth } from '../composables/useAuth';

const route = useRoute();
const router = useRouter();
const { logout, isTeacher } = useAuth();

const detail = ref(null);
const loadingDetail = ref(false);
const loadingMaterials = ref(false);
const error = ref('');
const materialsError = ref('');
const savingAction = ref(false);
const toast = reactive({ visible: false, message: '', type: 'info' });

const renameDialogOpen = ref(false);
const renameError = ref('');
const renameForm = reactive({ name: '' });
const removeMemberDialog = ref(null);
const dissolveDialogOpen = ref(false);
const activeDetailView = ref('materials');
const detailViewOptions = [
  { key: 'materials', label: '课程资料' },
  { key: 'members', label: '班级成员' }
];

const materialsRows = ref([]);
const materialsTotal = ref(0);
const materialsPage = ref(1);
const materialsPageSize = ref(20);
const materialsPageJump = ref(1);
const materialsKeyword = ref('');
const materialsOrder = ref('desc');

const uploadDialogOpen = ref(false);
const uploadFile = ref(null);
const uploadError = ref('');
const uploadForm = reactive({ title: '' });
const fileInput = ref(null);

const editMaterialDialog = ref(null);
const editMaterialError = ref('');
const editMaterialForm = reactive({ title: '' });

const deleteMaterialDialog = ref(null);

const isCreator = computed(() => !!detail.value?.is_creator);
const canManageMaterials = computed(() => String(detail.value?.member_role || '').trim() === 'teacher');
const canDissolveClass = computed(() => isTeacher.value && isCreator.value && activeDetailView.value === 'members');
const materialsTotalPages = computed(() => Math.max(1, Math.ceil(materialsTotal.value / materialsPageSize.value)));
const membersPage = ref(1);
const membersPageSize = ref(12);
const membersPageJump = ref(1);
const membersTotal = computed(() => detail.value?.members?.length || 0);
const membersTotalPages = computed(() => Math.max(1, Math.ceil(membersTotal.value / membersPageSize.value)));
const pagedMembers = computed(() => {
  const members = detail.value?.members || [];
  const start = (membersPage.value - 1) * membersPageSize.value;
  return members.slice(start, start + membersPageSize.value);
});

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

function memberRoleLabel(role) {
  return role === 'teacher' ? '教师' : '学生';
}

function formatMaterialType(item) {
  return item.file_format || String(item.original_filename || '').split('.').pop()?.toUpperCase() || '文件';
}

function formatFileSize(value) {
  const size = Number(value || 0);
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

async function fetchRaw(path, options = {}) {
  const response = await fetch(`${getApiRoot()}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
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

async function loadDetail() {
  loadingDetail.value = true;
  error.value = '';
  try {
    detail.value = await apiRequest(`/api/user/classes/${route.params.id}`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  } finally {
    loadingDetail.value = false;
  }
}

async function refreshMaterials() {
  loadingMaterials.value = true;
  materialsError.value = '';
  try {
    const data = await apiRequest(`/api/user/classes/${route.params.id}/materials`, {
      params: {
        limit: materialsPageSize.value,
        offset: (materialsPage.value - 1) * materialsPageSize.value,
        keyword: materialsKeyword.value,
        id_order: materialsOrder.value
      }
    });
    materialsRows.value = data.rows || [];
    materialsTotal.value = data.total || 0;
    materialsPageJump.value = materialsPage.value;
  } catch (err) {
    materialsError.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  } finally {
    loadingMaterials.value = false;
  }
}

async function reloadAll() {
  await loadDetail();
  await refreshMaterials();
}

function changeMembersPage(nextPage) {
  membersPage.value = Math.min(Math.max(1, nextPage), membersTotalPages.value);
  membersPageJump.value = membersPage.value;
}

function jumpToMembersPage() {
  changeMembersPage(Number(membersPageJump.value || 1));
}

async function copyClassCode(item) {
  try {
    await navigator.clipboard.writeText(item.code || '');
    showToast(`班级码已复制：${item.code}`, 'success');
  } catch (copyError) {
    showToast(`复制失败，请手动记录：${item.code}`, 'error');
  }
}

function goBack() {
  router.push({ name: 'Classes' });
}

function changeMaterialsPage(nextPage) {
  materialsPage.value = Math.min(Math.max(1, nextPage), materialsTotalPages.value);
  refreshMaterials();
}

function jumpToMaterialsPage() {
  changeMaterialsPage(Number(materialsPageJump.value || 1));
}

function toggleMaterialsOrder() {
  materialsOrder.value = materialsOrder.value === 'asc' ? 'desc' : 'asc';
  materialsPage.value = 1;
  refreshMaterials();
}

function openRenameDialog() {
  renameForm.name = detail.value?.name || '';
  renameError.value = '';
  renameDialogOpen.value = true;
}

function closeRenameDialog() {
  renameDialogOpen.value = false;
  renameError.value = '';
}

async function submitRenameClass() {
  renameError.value = '';
  if (!renameForm.name.trim()) {
    renameError.value = '请输入班级名';
    return;
  }
  if (textDisplayWidth(renameForm.name.trim()) > 40) {
    renameError.value = '班级名称不得超过20个字';
    return;
  }

  savingAction.value = true;
  try {
    await apiRequest(`/api/user/classes/${route.params.id}`, {
      method: 'PUT',
      body: { name: renameForm.name.trim() }
    });
    closeRenameDialog();
    await loadDetail();
    showToast('班级名称已更新', 'success');
  } catch (err) {
    if (err instanceof ApiError && err.status !== 401) renameError.value = err.message;
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

function confirmRemoveMember(member) {
  removeMemberDialog.value = member;
}

function closeRemoveMemberDialog() {
  removeMemberDialog.value = null;
}

function confirmDissolveClass() {
  dissolveDialogOpen.value = true;
}

function closeDissolveDialog() {
  dissolveDialogOpen.value = false;
}

async function submitRemoveMember() {
  if (!removeMemberDialog.value) return;
  savingAction.value = true;
  try {
    await apiRequest(`/api/user/classes/${route.params.id}/members/${removeMemberDialog.value.user_id}`, {
      method: 'DELETE'
    });
    closeRemoveMemberDialog();
    await loadDetail();
    showToast('学生已移除', 'success');
  } catch (err) {
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

async function submitDissolveClass() {
  if (!detail.value) return;
  savingAction.value = true;
  try {
    await apiRequest(`/api/user/classes/${route.params.id}`, {
      method: 'DELETE'
    });
    closeDissolveDialog();
    router.push({ name: 'Classes' });
  } catch (err) {
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

function openUploadDialog() {
  uploadDialogOpen.value = true;
  uploadForm.title = '';
  uploadFile.value = null;
  uploadError.value = '';
  if (fileInput.value) fileInput.value.value = '';
}

function closeUploadDialog() {
  uploadDialogOpen.value = false;
  uploadError.value = '';
}

function handleFileChange(event) {
  uploadError.value = '';
  const file = event.target.files?.[0] || null;
  uploadFile.value = file;
  if (!file) return;
  const name = file.name.toLowerCase();
  const isPdf = name.endsWith('.pdf');
  const isHtml = name.endsWith('.html') || name.endsWith('.htm');
  const isDoc = name.endsWith('.doc') || name.endsWith('.docx');
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg|avif|ico|tiff?|heic|heif)$/i.test(file.name);
  if (!isPdf && !isHtml && !isImage && !isDoc) {
    uploadError.value = '仅支持 HTML、图片、PDF 或 Word 文件';
  } else if (isDoc && file.size > 200 * 1024 * 1024) {
    uploadError.value = 'Word 文件不能超过 200MB';
  } else if (isPdf && file.size > 200 * 1024 * 1024) {
    uploadError.value = 'PDF 文件不能超过 200MB';
  } else if (isImage && file.size > 20 * 1024 * 1024) {
    uploadError.value = '图片文件不能超过 20MB';
  } else if (isHtml && file.size > 10 * 1024 * 1024) {
    uploadError.value = 'HTML 文件不能超过 10MB';
  }
}

async function submitUploadMaterial() {
  uploadError.value = '';
  if (!uploadFile.value) {
    uploadError.value = '请选择文件';
    return;
  }
  handleFileChange({ target: { files: [uploadFile.value] } });
  if (uploadError.value) return;

  savingAction.value = true;
  try {
    await fetchRaw(`/api/user/classes/${route.params.id}/materials/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': uploadFile.value.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(uploadFile.value.name),
        'X-Title': encodeURIComponent(uploadForm.title.trim())
      },
      body: uploadFile.value
    });
    closeUploadDialog();
    materialsPage.value = 1;
    await Promise.all([loadDetail(), refreshMaterials()]);
    showToast('课程资料已上传', 'success');
  } catch (err) {
    uploadError.value = err instanceof ApiError ? err.message : '上传失败';
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

function openEditDialog(item) {
  editMaterialDialog.value = item;
  editMaterialForm.title = item.title || '';
  editMaterialError.value = '';
}

function closeEditDialog() {
  editMaterialDialog.value = null;
  editMaterialError.value = '';
}

async function submitEditMaterial() {
  editMaterialError.value = '';
  if (!editMaterialForm.title.trim()) {
    editMaterialError.value = '请输入标题';
    return;
  }
  savingAction.value = true;
  try {
    await apiRequest(`/api/user/classes/${route.params.id}/materials/${editMaterialDialog.value.id}`, {
      method: 'PUT',
      body: { title: editMaterialForm.title.trim() }
    });
    closeEditDialog();
    await refreshMaterials();
    showToast('标题已更新', 'success');
  } catch (err) {
    if (err instanceof ApiError && err.status !== 401) editMaterialError.value = err.message;
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

function confirmDeleteMaterial(item) {
  deleteMaterialDialog.value = item;
}

function closeDeleteMaterialDialog() {
  deleteMaterialDialog.value = null;
}

async function submitDeleteMaterial() {
  if (!deleteMaterialDialog.value) return;
  savingAction.value = true;
  try {
    await apiRequest(`/api/user/classes/${route.params.id}/materials/${deleteMaterialDialog.value.id}`, {
      method: 'DELETE'
    });
    closeDeleteMaterialDialog();
    await Promise.all([loadDetail(), refreshMaterials()]);
    showToast('课程资料已删除', 'success');
  } catch (err) {
    handleApiError(err);
  } finally {
    savingAction.value = false;
  }
}

async function materialBlob(item) {
  const response = await fetchRaw(`/api/user/classes/${route.params.id}/materials/${item.id}/content`);
  return response.blob();
}

async function downloadMaterial(item) {
  try {
    const blob = await materialBlob(item);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.original_filename || `${item.title || 'class-material'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    handleApiError(err);
  }
}

watch(() => materialsKeyword.value, () => {
  materialsPage.value = 1;
  refreshMaterials();
});

watch(detail, () => {
  if (membersPage.value > membersTotalPages.value) {
    membersPage.value = membersTotalPages.value;
  }
  membersPageJump.value = membersPage.value;
});

onMounted(async () => {
  await reloadAll();
});
</script>
