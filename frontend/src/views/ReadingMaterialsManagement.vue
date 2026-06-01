<template>
  <section class="card management-page reading-materials-page">
    <div class="management-header">
      <div>
        <h2>阅读材料管理</h2>
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
        <div class="toolbar-right">
          <button @click="openUpload">上传文件</button>
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
        <table class="table reading-materials-table">
          <thead>
            <tr>
              <th>标题</th>
              <th>原文件名</th>
              <th>上传者</th>
              <th>文件格式</th>
              <th>大小</th>
              <th>上传时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in rows" :key="item.id">
              <td>
                <span class="reading-material-title" :title="item.title">{{ item.title }}</span>
              </td>
              <td>{{ item.original_filename }}</td>
              <td>{{ item.uploader_username || '-' }}</td>
              <td>{{ formatMaterialType(item) }}</td>
              <td>{{ formatFileSize(item.file_size) }}</td>
              <td>{{ item.created_at || '-' }}</td>
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
                <button class="ghost" @click="openEdit(item)">编辑</button>
                <button class="danger" @click="confirmDelete(item)">删除</button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="7" class="empty">暂无阅读材料</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="pagination management-inline-pagination">
      <button class="ghost" :disabled="page === 1 || loading" @click="changePage(page - 1)">上一页</button>
      <label class="management-pagination-jump" for="reading-materials-page-jump">
        第
        <input
          id="reading-materials-page-jump"
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

    <div v-if="uploadOpen" class="overlay">
      <div class="modal reading-material-upload-modal">
        <div class="modal-header">
          <h3>上传阅读材料</h3>
          <button class="ghost" @click="closeUpload">关闭</button>
        </div>
        <form @submit.prevent="submitUpload">
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
            <button class="ghost" type="button" @click="closeUpload">取消</button>
            <button type="submit" :disabled="uploading">上传</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="editDialog" class="overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>编辑阅读材料</h3>
          <button class="ghost" @click="closeEdit">关闭</button>
        </div>
        <form @submit.prevent="submitEdit">
          <label>
            标题
            <input v-model="editForm.title" />
          </label>
          <p v-if="editError" class="error">{{ editError }}</p>
          <div class="modal-actions">
            <button class="ghost" type="button" @click="closeEdit">取消</button>
            <button type="submit" :disabled="saving">保存</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="deleteDialog" class="overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>确认删除</h3>
          <button class="ghost" @click="closeDelete">关闭</button>
        </div>
        <p>即将删除阅读材料：<strong>{{ deleteDialog.title || deleteDialog.original_filename }}</strong></p>
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
import { apiRequest, ApiError, getApiBase, getAuthToken } from '../utils/apiClient';
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
const uploadOpen = ref(false);
const uploadFile = ref(null);
const uploadError = ref('');
const uploading = ref(false);
const fileInput = ref(null);
const editDialog = ref(null);
const editError = ref('');
const saving = ref(false);
const deleting = ref(false);
const deleteDialog = ref(null);
const toast = reactive({ visible: false, message: '', type: 'info' });

const uploadForm = reactive({ title: '' });
const editForm = reactive({ title: '' });
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

function showToast(message, type = 'info') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  setTimeout(() => (toast.visible = false), 1600);
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

function formatFileSize(value) {
  const size = Number(value || 0);
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function formatMaterialType(item) {
  return item.file_format || String(item.original_filename || '').split('.').pop()?.toUpperCase() || '文件';
}

function adminRawUrl(path) {
  return `${getApiBase()}${path}`;
}

async function fetchRaw(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${getAuthToken()}`
  };
  const response = await fetch(adminRawUrl(path), { ...options, headers });
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
    const data = await apiRequest('/reading-materials', {
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

function openUpload() {
  uploadForm.title = '';
  uploadFile.value = null;
  uploadError.value = '';
  if (fileInput.value) fileInput.value.value = '';
  uploadOpen.value = true;
}

function closeUpload() {
  uploadOpen.value = false;
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

async function submitUpload() {
  uploadError.value = '';
  if (!uploadFile.value) {
    uploadError.value = '请选择文件';
    return;
  }
  handleFileChange({ target: { files: [uploadFile.value] } });
  if (uploadError.value) return;

  uploading.value = true;
  try {
    await fetchRaw('/reading-materials/upload', {
      method: 'POST',
      headers: {
        'Content-Type': uploadFile.value.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(uploadFile.value.name),
        'X-Title': encodeURIComponent(uploadForm.title.trim())
      },
      body: uploadFile.value
    });
    closeUpload();
    showToast('阅读材料已上传', 'success');
    await refresh();
  } catch (err) {
    uploadError.value = err instanceof ApiError ? err.message : '上传失败';
  } finally {
    uploading.value = false;
  }
}

function openEdit(item) {
  editDialog.value = item;
  editForm.title = item.title || '';
  editError.value = '';
}

function closeEdit() {
  editDialog.value = null;
  editError.value = '';
}

async function submitEdit() {
  editError.value = '';
  if (!editForm.title.trim()) {
    editError.value = '请输入标题';
    return;
  }

  saving.value = true;
  try {
    await apiRequest(`/reading-materials/${editDialog.value.id}`, {
      method: 'PUT',
      body: { title: editForm.title.trim() }
    });
    closeEdit();
    showToast('标题已更新', 'success');
    await refresh();
  } catch (err) {
    editError.value = err instanceof ApiError ? err.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

async function materialBlob(item) {
  const response = await fetchRaw(`/reading-materials/${item.id}/content`);
  return response.blob();
}

async function downloadMaterial(item) {
  try {
    const blob = await materialBlob(item);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.original_filename || `${item.title || 'reading-material'}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    handleApiError(err);
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
    await apiRequest(`/reading-materials/${deleteDialog.value.id}`, { method: 'DELETE' });
    showToast('阅读材料已删除', 'success');
    closeDelete();
    await refresh();
  } catch (err) {
    handleApiError(err);
  } finally {
    deleting.value = false;
  }
}

watch(() => keyword.value, () => {
  page.value = 1;
  refresh();
});

onMounted(refresh);
</script>
