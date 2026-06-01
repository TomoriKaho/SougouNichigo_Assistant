<template>
  <section class="card management-page grammar-page">
    <div class="management-header">
      <div>
        <h2>文法管理</h2>
        <p class="muted total-count">共 {{ total }} 条</p>
      </div>
      <div class="toolbar management-toolbar">
        <div class="toolbar-left">
          <select v-model.number="filters.textbookId">
            <option v-for="textbook in textbooks" :key="textbook.id" :value="textbook.id">{{ textbook.name }}</option>
          </select>
          <select v-model.number="filters.lessonId" class="lesson-filter-select">
            <option :value="0">全部课</option>
            <option v-for="lesson in lessonOptions" :key="lesson.id" :value="lesson.id">
              第{{ lesson.lesson_number }}课
            </option>
          </select>
          <select v-model.number="filters.unitId" :disabled="lessonFilterAll">
            <option :value="0">全部单元</option>
            <option v-for="unit in unitOptions" :key="unit.id" :value="unit.id">
              {{ unit.name }}
            </option>
          </select>
          <input v-model.trim="keyword" placeholder="搜索文法条目" @keydown.enter.prevent="refresh" />
          <button class="ghost" @click="toggleIdOrder" :disabled="loading">
            {{ idOrder === 'asc' ? '倒序查看' : '顺序查看' }}
          </button>
          <button class="ghost" @click="refresh" :disabled="loading">刷新</button>
        </div>
        <div class="toolbar-right">
          <button @click="openCreate">新建文法</button>
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
        <table class="table grammar-table">
          <thead>
            <tr>
              <th>文法</th>
              <th>教材</th>
              <th>课</th>
              <th>单元</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in rows" :key="item.id">
              <td>
                <span class="grammar-entry-text" :title="grammarDisplay(item)">{{ grammarDisplay(item) }}</span>
              </td>
              <td>{{ item.textbook_name || '-' }}</td>
              <td>第{{ item.lesson_number || '-' }}课</td>
              <td>{{ item.unit_name || '-' }}</td>
              <td class="actions">
                <button class="ghost" @click="openEdit(item)">编辑详情</button>
                <button class="danger" @click="confirmDelete(item)">删除</button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="5" class="empty">暂无文法条目</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="pagination management-inline-pagination">
      <button class="ghost" :disabled="page === 1 || loading" @click="changePage(page - 1)">上一页</button>
      <label class="management-pagination-jump" for="grammar-page-jump">
        第
        <input
          id="grammar-page-jump"
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
      <div class="drawer grammar-edit-drawer">
        <header>
          <h3>{{ editingId ? '编辑文法详情' : '新建文法' }}</h3>
          <div class="drawer-header-actions">
            <button type="submit" form="grammar-edit-form" :disabled="saving">保存</button>
            <button class="ghost" @click="closeDrawer">关闭</button>
          </div>
        </header>
        <div class="drawer-body">
          <form id="grammar-edit-form" class="scroll-form" @submit.prevent="submitSave">
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
              </div>
            </template>

            <div v-else class="detail-grid grammar-context-grid">
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
            </div>

            <div class="drawer-inline-row drawer-field-row">
              <label class="drawer-field">
                文法
                <input v-model="form.grammar" />
                <span v-if="formErrors.grammar" class="field-error">{{ formErrors.grammar }}</span>
              </label>
              <label class="drawer-field">
                简要逻辑
                <input v-model="form.brief_logic" />
              </label>
            </div>

            <label>
              意义
              <textarea v-model="form.meaning" rows="4"></textarea>
            </label>
            <label>
              译文
              <textarea v-model="form.translation" rows="3"></textarea>
            </label>
            <label>
              接续
              <textarea v-model="form.formation" rows="3"></textarea>
            </label>
            <label>
              说明
              <textarea v-model="form.notes" rows="3"></textarea>
            </label>
            <div class="list-editor grammar-example-editor">
              <div class="list-title">例句</div>
              <div v-for="(example, index) in examples" :key="index" class="list-row">
                <input v-model="examples[index]" :placeholder="`例句 ${index + 1}`" />
                <button class="ghost" type="button" @click="removeExample(index)">删除</button>
              </div>
              <button class="ghost" type="button" @click="addExample">新增例句</button>
            </div>
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
        <p>即将删除文法：<strong>{{ deleteDialog.grammar || deleteDialog.id }}</strong></p>
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
const keyword = ref('');
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
const examples = ref([]);
const toast = reactive({ visible: false, message: '', type: 'info' });

const filters = reactive({
  textbookId: 0,
  lessonId: 0,
  unitId: 0
});

const form = reactive({
  grammar: '',
  brief_logic: '',
  meaning: '',
  translation: '',
  formation: '',
  notes: ''
});
const formErrors = reactive({ grammar: '' });

const createContext = reactive({
  textbook_id: 0,
  lesson_id: 0,
  unit_id: 0
});

const textbooks = computed(() => options.value.textbooks || []);
const selectedTextbook = computed(() => textbooks.value.find((item) => Number(item.id) === Number(filters.textbookId)) || null);
const lessonOptions = computed(() => selectedTextbook.value?.lessons || []);
const selectedLesson = computed(() => lessonOptions.value.find((item) => Number(item.id) === Number(filters.lessonId)) || null);
const unitOptions = computed(() => (filters.lessonId ? selectedLesson.value?.units || [] : lessonOptions.value.flatMap((lesson) => lesson.units || [])));
const lessonFilterAll = computed(() => Number(filters.lessonId) === 0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

const createTextbook = computed(() => textbooks.value.find((item) => Number(item.id) === Number(createContext.textbook_id)) || null);
const createLessonOptions = computed(() => createTextbook.value?.lessons || []);
const createLesson = computed(() => createLessonOptions.value.find((item) => Number(item.id) === Number(createContext.lesson_id)) || null);
const createUnitOptions = computed(() => createLesson.value?.units || []);

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

function resetForm() {
  form.grammar = '';
  form.brief_logic = '';
  form.meaning = '';
  form.translation = '';
  form.formation = '';
  form.notes = '';
  examples.value = [];
  formErrors.grammar = '';
}

function fillCreateDefaults() {
  const textbook = textbooks.value[0];
  createContext.textbook_id = textbook?.id || 0;
  createContext.lesson_id = textbook?.lessons?.[0]?.id || 0;
  createContext.unit_id = textbook?.lessons?.[0]?.units?.[0]?.id || 0;
}

async function loadOptions() {
  const data = await apiRequest('/grammar/options');
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
    const data = await apiRequest('/grammar', {
      params: {
        limit: pageSize.value,
        offset: (page.value - 1) * pageSize.value,
        q: keyword.value,
        textbookId: filters.textbookId || '',
        lessonId: filters.lessonId || '',
        unitId: lessonFilterAll.value ? '' : filters.unitId || '',
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
    const data = await apiRequest(`/grammar/${item.id}`);
    activeEntry.value = data;
    editingId.value = data.id;
    form.grammar = data.grammar || '';
    form.brief_logic = data.brief_logic || '';
    form.meaning = data.meaning || '';
    form.translation = data.translation || '';
    form.formation = data.formation || '';
    form.notes = data.notes || '';
    examples.value = [...(data.examples || [])];
    formErrors.grammar = '';
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
  formErrors.grammar = '';
  if (!form.grammar.trim()) formErrors.grammar = '请输入文法内容';
  if (!editingId.value) {
    if (!createContext.textbook_id || !createContext.lesson_id || !createContext.unit_id) {
      showToast('请选择教材、课和单元', 'error');
      return false;
    }
  }
  return !formErrors.grammar;
}

function payloadFromForm() {
  return {
    grammar: form.grammar.trim(),
    brief_logic: form.brief_logic.trim() || null,
    meaning: form.meaning.trim() || null,
    translation: form.translation.trim() || null,
    formation: form.formation.trim() || null,
    notes: form.notes.trim() || null,
    examples: examples.value
      .map((item) => item.trim())
      .filter(Boolean)
  };
}

function addExample() {
  examples.value.push('');
}

function removeExample(index) {
  examples.value.splice(index, 1);
}

function grammarDisplay(item) {
  const grammar = String(item?.grammar || '').trim();
  const briefLogic = String(item?.brief_logic || '').trim();
  return briefLogic ? `${grammar} <${briefLogic}>` : grammar;
}

async function submitSave() {
  if (!validateForm()) return;
  saving.value = true;
  try {
    if (editingId.value) {
      await apiRequest(`/grammar/${editingId.value}`, {
        method: 'PUT',
        body: payloadFromForm()
      });
      showToast('文法已更新', 'success');
    } else {
      await apiRequest('/grammar', {
        method: 'POST',
        body: {
          ...payloadFromForm(),
          textbook_id: createContext.textbook_id,
          lesson_id: createContext.lesson_id,
          unit_id: createContext.unit_id
        }
      });
      showToast('文法已创建', 'success');
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
    await apiRequest(`/grammar/${deleteDialog.value.id}`, { method: 'DELETE' });
    showToast('文法已删除', 'success');
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

watch(() => [filters.unitId, keyword.value], () => {
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
