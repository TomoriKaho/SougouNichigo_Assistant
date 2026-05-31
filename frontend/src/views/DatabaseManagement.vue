<template>
  <section class="card db-page management-page">
    <div class="management-header">
      <div>
        <h2>数据库管理</h2>
      </div>
      <div class="toolbar management-toolbar">
        <div class="toolbar-left">
          <div class="toggle-group">
            <span class="toggle-label" :class="{ active: activeTab === 'backup' }">备份</span>
            <label class="switch">
              <input type="checkbox" v-model="isImportMode" />
              <span class="slider"></span>
            </label>
            <span class="toggle-label" :class="{ active: activeTab === 'import' }">导入</span>
          </div>
        </div>
        <div class="management-actions">
          <span class="muted management-pagination-total">共 {{ activeRecordCount }} 条</span>
          <button class="ghost" @click="refresh" :disabled="loading">刷新</button>
          <button v-if="activeTab === 'backup'" @click="openBackupCreate">新增备份</button>
          <button v-else @click="openImportDialog">导入 .zip</button>
        </div>
      </div>
    </div>

    <div class="management-page-body">
      <div v-if="error" class="error-block">
        <p class="error">{{ error }}</p>
        <button class="ghost" @click="refresh">重试</button>
      </div>
      <div v-else-if="loading" class="loading">加载中...</div>
      <div v-else class="management-scroll">
        <div v-if="activeTab === 'backup'" class="db-panel">
          <div class="panel-header">
            <h3>备份记录</h3>
          </div>
          <table class="table compact-table">
            <thead>
              <tr>
                <th>备份时间</th>
                <th>备份文件</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in backups" :key="record.id">
                <td>{{ record.createdAt }}</td>
                <td>
                  <div class="file-grid">
                    <span v-for="file in sortedFiles(record.files)" :key="file.key" class="list-line">{{ file.label }}</span>
                  </div>
                </td>
                <td class="actions">
                  <button class="ghost" @click="downloadBackup(record)">下载</button>
                  <button class="danger" @click="confirmRestore(record)">还原</button>
                  <button class="warning" @click="confirmDeleteBackup(record)">删除</button>
                </td>
              </tr>
              <tr v-if="!backups.length">
                <td colspan="3" class="empty">暂无备份记录</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="db-panel">
          <div class="panel-header">
            <h3>导入记录</h3>
          </div>
          <table class="table compact-table">
            <thead>
              <tr>
                <th>导入时间</th>
                <th>导入文件</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in imports" :key="record.id">
                <td>{{ record.createdAt }}</td>
                <td>
                  <div class="file-grid">
                    <span v-for="file in sortedNames(record.files)" :key="file" class="list-line">{{ file }}</span>
                  </div>
                </td>
                <td class="actions">
                  <button class="warning" @click="confirmDeleteImport(record)">删除</button>
                </td>
              </tr>
              <tr v-if="!imports.length">
                <td colspan="3" class="empty">暂无导入记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="backupDialogOpen" class="overlay">
      <div class="drawer">
        <header>
          <h3>新增备份</h3>
          <button class="ghost" @click="closeBackupCreate">关闭</button>
        </header>
        <form @submit.prevent="submitBackup">
          <div class="list-editor">
            <div class="list-title">选择需要备份的文件</div>
            <label v-for="file in fileOptions" :key="file.key" class="checkbox-row">
              <input type="checkbox" v-model="backupSelection[file.key]" />
              <span>{{ file.label }}</span>
            </label>
            <div class="hint">默认全选，仅包含三个 SQLite 数据库。</div>
          </div>
          <button type="submit" :disabled="saving">保存备份</button>
        </form>
      </div>
    </div>

    <div v-if="deleteBackupDialog" class="overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>确认删除备份</h3>
          <button class="ghost" @click="closeDeleteBackup">关闭</button>
        </div>
        <p>即将删除备份：<strong>{{ deleteBackupDialog.createdAt }}</strong></p>
        <p class="muted">此操作会同时删除备份文件。</p>
        <div class="modal-actions">
          <button class="ghost" @click="closeDeleteBackup">取消</button>
          <button class="warning" :disabled="saving" @click="submitDeleteBackup">确认删除</button>
        </div>
      </div>
    </div>

    <div v-if="restoreDialog" class="overlay">
      <div class="modal warning">
        <div class="modal-header">
          <h3>确认还原备份</h3>
          <button class="ghost" @click="closeRestore">关闭</button>
        </div>
        <p>将使用备份覆盖当前数据：<strong>{{ restoreDialog.createdAt }}</strong></p>
        <p class="muted">还原后建议重启后端服务，以确保 SQLite 连接读取最新文件。</p>
        <div class="modal-actions">
          <button class="ghost" @click="closeRestore">取消</button>
          <button class="danger" :disabled="saving" @click="submitRestore">确认还原</button>
        </div>
      </div>
    </div>

    <div v-if="importDialogOpen" class="overlay">
      <div class="drawer">
        <header>
          <h3>导入数据</h3>
          <button class="ghost" @click="closeImportDialog">关闭</button>
        </header>
        <form @submit.prevent="confirmImport">
          <div class="warning-banner">导入会覆盖现有数据库文件，建议先进行一次备份。</div>
          <label>
            选择 .zip 文件
            <input type="file" accept=".zip" @change="handleImportFile" />
            <span class="hint" v-if="importFileName">已选择：{{ importFileName }}</span>
            <span v-if="formErrors.importFile" class="field-error">{{ formErrors.importFile }}</span>
          </label>
          <button type="submit" :disabled="saving">开始导入</button>
        </form>
      </div>
    </div>

    <div v-if="importConfirmDialog" class="overlay">
      <div class="modal warning">
        <div class="modal-header">
          <h3>确认导入</h3>
          <button class="ghost" @click="closeImportConfirm">关闭</button>
        </div>
        <p>导入将覆盖现有数据，请确认已完成备份。</p>
        <div class="modal-actions">
          <button class="ghost" @click="closeImportConfirm">取消</button>
          <button class="danger" :disabled="saving" @click="submitImport">确认导入</button>
        </div>
      </div>
    </div>

    <div v-if="deleteImportDialog" class="overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>确认删除导入记录</h3>
          <button class="ghost" @click="closeDeleteImport">关闭</button>
        </div>
        <p>即将删除导入记录：<strong>{{ deleteImportDialog.createdAt }}</strong></p>
        <div class="modal-actions">
          <button class="ghost" @click="closeDeleteImport">取消</button>
          <button class="warning" :disabled="saving" @click="submitDeleteImport">确认删除</button>
        </div>
      </div>
    </div>

    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest, ApiError, getAdminToken, getApiBase } from '../utils/apiClient';
import { useAuth } from '../composables/useAuth';

const { logout } = useAuth();
const router = useRouter();

const fileOptions = ref([]);
const backups = ref([]);
const imports = ref([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const isImportMode = ref(false);
const backupDialogOpen = ref(false);
const importDialogOpen = ref(false);
const importConfirmDialog = ref(false);
const deleteBackupDialog = ref(null);
const restoreDialog = ref(null);
const deleteImportDialog = ref(null);
const importFile = ref(null);
const importFileName = ref('');
const backupSelection = reactive({});
const formErrors = reactive({ importFile: '' });
const toast = reactive({ visible: false, message: '', type: 'info' });

const activeTab = computed(() => (isImportMode.value ? 'import' : 'backup'));
const activeRecordCount = computed(() => (activeTab.value === 'backup' ? backups.value.length : imports.value.length));

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
    const [filesData, backupsData, importsData] = await Promise.all([
      apiRequest('/db-files'),
      apiRequest('/db-backups'),
      apiRequest('/db-imports')
    ]);
    fileOptions.value = filesData.files || [];
    backups.value = backupsData.records || [];
    imports.value = importsData.records || [];
    fileOptions.value.forEach((file) => {
      if (backupSelection[file.key] === undefined) backupSelection[file.key] = true;
    });
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  } finally {
    loading.value = false;
  }
}

function sortedFiles(files = []) {
  return [...files].sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
}

function sortedNames(files = []) {
  return [...files].sort((a, b) => String(a).localeCompare(String(b)));
}

function openBackupCreate() {
  fileOptions.value.forEach((file) => (backupSelection[file.key] = true));
  backupDialogOpen.value = true;
}

function closeBackupCreate() {
  backupDialogOpen.value = false;
}

async function submitBackup() {
  const files = fileOptions.value.filter((file) => backupSelection[file.key]).map((file) => file.key);
  if (!files.length) {
    showToast('请选择至少一个数据库文件', 'error');
    return;
  }
  saving.value = true;
  try {
    await apiRequest('/db-backups', { method: 'POST', body: { files } });
    showToast('备份已创建', 'success');
    closeBackupCreate();
    await refresh();
  } catch (err) {
    handleApiError(err);
  } finally {
    saving.value = false;
  }
}

async function downloadBackup(record) {
  try {
    const data = await apiRequest(`/db-backups/${record.id}/download-link`);
    if (data.url) window.open(data.url, '_blank');
  } catch (err) {
    handleApiError(err);
  }
}

function confirmDeleteBackup(record) {
  deleteBackupDialog.value = record;
}

function closeDeleteBackup() {
  deleteBackupDialog.value = null;
}

async function submitDeleteBackup() {
  if (!deleteBackupDialog.value) return;
  saving.value = true;
  try {
    await apiRequest(`/db-backups/${deleteBackupDialog.value.id}`, { method: 'DELETE' });
    showToast('备份已删除', 'success');
    closeDeleteBackup();
    await refresh();
  } catch (err) {
    handleApiError(err);
  } finally {
    saving.value = false;
  }
}

function confirmRestore(record) {
  restoreDialog.value = record;
}

function closeRestore() {
  restoreDialog.value = null;
}

async function submitRestore() {
  if (!restoreDialog.value) return;
  saving.value = true;
  try {
    await apiRequest(`/db-backups/${restoreDialog.value.id}/restore`, { method: 'POST' });
    showToast('备份已还原，建议重启后端', 'success');
    closeRestore();
  } catch (err) {
    handleApiError(err);
  } finally {
    saving.value = false;
  }
}

function openImportDialog() {
  formErrors.importFile = '';
  importFile.value = null;
  importFileName.value = '';
  importDialogOpen.value = true;
}

function closeImportDialog() {
  importDialogOpen.value = false;
}

function handleImportFile(event) {
  const file = event.target.files?.[0] || null;
  importFile.value = file;
  importFileName.value = file?.name || '';
  formErrors.importFile = '';
}

function confirmImport() {
  if (!importFile.value) {
    formErrors.importFile = '请选择 .zip 文件';
    return;
  }
  importConfirmDialog.value = true;
}

function closeImportConfirm() {
  importConfirmDialog.value = false;
}

async function submitImport() {
  if (!importFile.value) return;
  saving.value = true;
  try {
    const response = await fetch(`${getApiBase()}/db-imports`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAdminToken()}`,
        'Content-Type': 'application/zip'
      },
      body: await importFile.value.arrayBuffer()
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(data?.error || '导入失败', { status: response.status, data });
    showToast('导入完成，建议重启后端', 'success');
    closeImportConfirm();
    closeImportDialog();
    await refresh();
  } catch (err) {
    handleApiError(err);
  } finally {
    saving.value = false;
  }
}

function confirmDeleteImport(record) {
  deleteImportDialog.value = record;
}

function closeDeleteImport() {
  deleteImportDialog.value = null;
}

async function submitDeleteImport() {
  if (!deleteImportDialog.value) return;
  saving.value = true;
  try {
    await apiRequest(`/db-imports/${deleteImportDialog.value.id}`, { method: 'DELETE' });
    showToast('导入记录已删除', 'success');
    closeDeleteImport();
    await refresh();
  } catch (err) {
    handleApiError(err);
  } finally {
    saving.value = false;
  }
}

onMounted(refresh);
</script>
