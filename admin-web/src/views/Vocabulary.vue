<template>
  <section class="card lexicon-page">
    <div class="header-row">
      <div class="header-copy">
        <h2>词库条目管理</h2>
      </div>
      <div class="toolbar">
        <div class="toolbar-left lexicon-filter-bar">
          <select v-model.number="filters.textbookId">
            <option v-for="textbook in textbooks" :key="textbook.id" :value="textbook.id">{{ textbook.name }}</option>
          </select>
          <select v-model.number="filters.lessonId">
            <option :value="0">全部课</option>
            <option v-for="lesson in lessonOptions" :key="lesson.id" :value="lesson.id">
              第{{ lesson.lesson_number }}课 {{ lesson.title }}
            </option>
          </select>
          <select v-model.number="filters.unitId">
            <option :value="0">全部单元</option>
            <option v-for="unit in unitOptions" :key="unit.id" :value="unit.id">
              {{ unit.name }}
            </option>
          </select>
          <select v-model="filters.tableType">
            <option value="all">全部词表</option>
            <option value="new">新出単語</option>
            <option value="practice">練習用単語</option>
          </select>
          <input v-model.trim="keyword" placeholder="搜索词条/词条补充/ID" @keydown.enter.prevent="refresh" />
          <button class="ghost" @click="toggleIdOrder" :disabled="loading">
            {{ idOrder === 'asc' ? '倒序查看' : '顺序查看' }}
          </button>
          <button class="ghost" @click="refresh" :disabled="loading">刷新</button>
        </div>
        <div class="toolbar-right">
          <div class="pagination inline-pagination">
            <span class="muted pagination-total">共 {{ total }} 条</span>
            <template v-if="total > pageSize">
              <button class="ghost" :disabled="page === 1 || loading" @click="changePage(page - 1)">上一页</button>
              <label class="pagination-jump" for="vocabulary-page-jump">
                第
                <input
                  id="vocabulary-page-jump"
                  v-model.number="pageJump"
                  class="page-jump-input page-number-input"
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
          <button v-if="isDev" @click="openCreate">新建条目</button>
        </div>
      </div>
    </div>

    <div class="lexicon-body">
      <div v-if="error" class="error-block">
        <p class="error">{{ error }}</p>
        <button class="ghost" @click="refresh">重试</button>
      </div>
      <div v-else-if="loading" class="loading">加载中...</div>
      <div v-else class="table-scroll">
        <div v-if="rows.length" class="lexicon-entry-grid">
          <article v-for="item in rows" :key="item.id" class="lexicon-entry-card">
            <div class="lexicon-entry-main">
              <div class="lexicon-entry-meta">
                <div class="lexicon-entry-title">
                  <span class="lexicon-entry-id">ID {{ item.id }}</span>
                  <span class="lexicon-entry-verb">{{ item.term }}</span>
                </div>
                <div class="lexicon-entry-actions">
                  <button class="ghost" @click="openEdit(item)">编辑</button>
                  <button v-if="isDev" class="danger" @click="confirmDelete(item)">删除</button>
                </div>
              </div>
              <p class="lexicon-entry-meaning">{{ item.explanation || '-' }}</p>
              <div class="lexicon-entry-tags">
                <div class="lexicon-entry-tag-row">
                  <span class="lexicon-entry-tag tag-tr">{{ item.textbook_name }}</span>
                  <span class="lexicon-entry-tag tag-irreg">第{{ item.lesson_number }}课</span>
                  <span class="lexicon-entry-tag tag-prnl">{{ item.unit_name }}</span>
                  <span class="lexicon-entry-tag tag-intr">{{ item.table_type_label }}</span>
                </div>
                <div class="lexicon-entry-tag-row">
                  <span v-if="item.supplement" class="lexicon-entry-tag tag-vdo">{{ item.supplement }}</span>
                  <span v-if="item.accent" class="lexicon-entry-tag tag-vio">声调 {{ item.accent }}</span>
                  <span v-if="item.part_of_speech" class="lexicon-entry-tag tag-viodo">{{ item.part_of_speech }}</span>
                </div>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="empty">暂无条目</div>
      </div>
    </div>

    <div v-if="drawerOpen" class="overlay">
      <div class="drawer lexicon-edit-drawer">
        <header>
          <h3>{{ editingId ? '编辑词条' : '新建词条' }}</h3>
          <div class="drawer-header-actions">
            <button type="submit" form="vocabulary-edit-form" :disabled="saving">保存</button>
            <button class="ghost" @click="closeDrawer">关闭</button>
          </div>
        </header>
        <div class="drawer-body">
          <form id="vocabulary-edit-form" @submit.prevent="submitSave">
            <template v-if="!editingId">
              <div class="drawer-inline-row drawer-field-row">
                <label class="drawer-field">
                  教材
                  <select v-model.number="createContext.textbook_id">
                    <option v-for="textbook in textbooks" :key="textbook.id" :value="textbook.id">{{ textbook.name }}</option>
                  </select>
                </label>
                <label class="drawer-field">
                  课
                  <select v-model.number="createContext.lesson_id">
                    <option v-for="lesson in createLessonOptions" :key="lesson.id" :value="lesson.id">
                      第{{ lesson.lesson_number }}课 {{ lesson.title }}
                    </option>
                  </select>
                </label>
              </div>
              <div class="drawer-inline-row drawer-field-row">
                <label class="drawer-field">
                  单元
                  <select v-model.number="createContext.unit_id">
                    <option v-for="unit in createUnitOptions" :key="unit.id" :value="unit.id">{{ unit.name }}</option>
                  </select>
                </label>
                <label class="drawer-field">
                  词表
                  <select v-model="createContext.table_type">
                    <option value="new">新出単語</option>
                    <option value="practice">練習用単語</option>
                  </select>
                </label>
              </div>
            </template>

            <div v-else class="detail-grid vocabulary-context-grid">
              <div class="detail-item">
                <span class="detail-label">教材</span>
                <span class="detail-value">{{ activeEntry?.textbook_name || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">课</span>
                <span class="detail-value">第{{ activeEntry?.lesson_number || '-' }}课 {{ activeEntry?.lesson_title || '' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">单元</span>
                <span class="detail-value">{{ activeEntry?.unit_name || '-' }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">词表</span>
                <span class="detail-value">{{ activeEntry?.table_type_label || '-' }}</span>
              </div>
            </div>

            <div class="drawer-inline-row drawer-field-row">
              <label class="drawer-field">
                词条
                <input v-model="form.term" />
                <span v-if="formErrors.term" class="field-error">{{ formErrors.term }}</span>
              </label>
              <label class="drawer-field">
                词条补充
                <input v-model="form.supplement" />
              </label>
            </div>

            <div class="drawer-inline-row drawer-field-row">
              <label class="drawer-field">
                声调
                <input v-model="form.accent" />
              </label>
              <label class="drawer-field">
                词性
                <input v-model="form.part_of_speech" />
              </label>
            </div>

            <label>
              解释
              <textarea v-model="form.explanation" rows="6"></textarea>
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
        <p>即将删除词条：<strong>{{ deleteDialog.term || deleteDialog.id }}</strong></p>
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

const { isDev, logout } = useAuth();
const router = useRouter();

const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(9);
const pageJump = ref(1);
const keyword = ref('');
const idOrder = ref('asc');
const loading = ref(false);
const error = ref('');
const options = ref({ textbooks: [], tableTypes: [] });
const drawerOpen = ref(false);
const editingId = ref(null);
const activeEntry = ref(null);
const saving = ref(false);
const deleting = ref(false);
const deleteDialog = ref(null);
const toast = reactive({ visible: false, message: '', type: 'info' });

const filters = reactive({
  textbookId: 0,
  lessonId: 0,
  unitId: 0,
  tableType: 'all'
});

const form = reactive({
  term: '',
  supplement: '',
  accent: '',
  part_of_speech: '',
  explanation: ''
});
const formErrors = reactive({ term: '' });

const createContext = reactive({
  textbook_id: 0,
  lesson_id: 0,
  unit_id: 0,
  table_type: 'new'
});

const textbooks = computed(() => options.value.textbooks || []);
const selectedTextbook = computed(() => textbooks.value.find((item) => Number(item.id) === Number(filters.textbookId)) || null);
const lessonOptions = computed(() => selectedTextbook.value?.lessons || []);
const selectedLesson = computed(() => lessonOptions.value.find((item) => Number(item.id) === Number(filters.lessonId)) || null);
const unitOptions = computed(() => (filters.lessonId ? selectedLesson.value?.units || [] : lessonOptions.value.flatMap((lesson) => lesson.units || [])));
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

const createTextbook = computed(() => textbooks.value.find((item) => Number(item.id) === Number(createContext.textbook_id)) || null);
const createLessonOptions = computed(() => createTextbook.value?.lessons || []);
const createLesson = computed(() => createLessonOptions.value.find((item) => Number(item.id) === Number(createContext.lesson_id)) || null);
const createUnitOptions = computed(() => createLesson.value?.units || []);

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
  form.term = '';
  form.supplement = '';
  form.accent = '';
  form.part_of_speech = '';
  form.explanation = '';
  formErrors.term = '';
}

function fillCreateDefaults() {
  const textbook = textbooks.value[0];
  createContext.textbook_id = textbook?.id || 0;
  createContext.lesson_id = textbook?.lessons?.[0]?.id || 0;
  createContext.unit_id = textbook?.lessons?.[0]?.units?.[0]?.id || 0;
  createContext.table_type = 'new';
}

async function loadOptions() {
  const data = await apiRequest('/vocabulary/options');
  options.value = data || { textbooks: [], tableTypes: [] };
  if (!filters.textbookId && textbooks.value.length) {
    filters.textbookId = textbooks.value[0].id;
  }
  fillCreateDefaults();
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/vocabulary', {
      params: {
        limit: pageSize.value,
        offset: (page.value - 1) * pageSize.value,
        q: keyword.value,
        textbookId: filters.textbookId || '',
        lessonId: filters.lessonId || '',
        unitId: filters.unitId || '',
        tableType: filters.tableType,
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
  if (!isDev.value) return;
  resetForm();
  fillCreateDefaults();
  activeEntry.value = null;
  editingId.value = null;
  drawerOpen.value = true;
}

async function openEdit(item) {
  try {
    const data = await apiRequest(`/vocabulary/${item.id}`);
    activeEntry.value = data;
    editingId.value = data.id;
    form.term = data.term || '';
    form.supplement = data.supplement || '';
    form.accent = data.accent || '';
    form.part_of_speech = data.part_of_speech || '';
    form.explanation = data.explanation || '';
    formErrors.term = '';
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
  formErrors.term = '';
  if (!form.term.trim()) formErrors.term = '请输入词条';
  if (!editingId.value) {
    if (!createContext.textbook_id || !createContext.lesson_id || !createContext.unit_id) {
      showToast('请选择教材、课和单元', 'error');
      return false;
    }
  }
  return !formErrors.term;
}

function payloadFromForm() {
  return {
    term: form.term.trim(),
    supplement: form.supplement.trim() || null,
    accent: form.accent.trim() || null,
    part_of_speech: form.part_of_speech.trim() || null,
    explanation: form.explanation.trim() || null
  };
}

async function submitSave() {
  if (!validateForm()) return;
  saving.value = true;
  try {
    if (editingId.value) {
      await apiRequest(`/vocabulary/${editingId.value}`, {
        method: 'PUT',
        body: payloadFromForm()
      });
      showToast('词条已更新', 'success');
    } else {
      await apiRequest('/vocabulary', {
        method: 'POST',
        body: {
          ...payloadFromForm(),
          textbook_id: createContext.textbook_id,
          lesson_id: createContext.lesson_id,
          unit_id: createContext.unit_id,
          table_type: createContext.table_type
        }
      });
      showToast('词条已创建', 'success');
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
  if (!isDev.value) return;
  deleteDialog.value = item;
}

function closeDelete() {
  deleteDialog.value = null;
}

async function submitDelete() {
  if (!deleteDialog.value) return;
  deleting.value = true;
  try {
    await apiRequest(`/vocabulary/${deleteDialog.value.id}`, { method: 'DELETE' });
    showToast('词条已删除', 'success');
    closeDelete();
    await refresh();
  } catch (err) {
    handleApiError(err);
  } finally {
    deleting.value = false;
  }
}

watch(() => filters.textbookId, () => {
  filters.lessonId = 0;
  filters.unitId = 0;
  page.value = 1;
  refresh();
});

watch(() => filters.lessonId, () => {
  filters.unitId = 0;
  page.value = 1;
  refresh();
});

watch(() => [filters.unitId, filters.tableType, keyword.value], () => {
  page.value = 1;
  refresh();
});

watch(() => createContext.textbook_id, () => {
  const lesson = createLessonOptions.value[0];
  createContext.lesson_id = lesson?.id || 0;
});

watch(() => createContext.lesson_id, () => {
  const unit = createUnitOptions.value[0];
  createContext.unit_id = unit?.id || 0;
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
