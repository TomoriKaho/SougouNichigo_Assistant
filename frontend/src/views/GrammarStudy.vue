<template>
  <section class="card management-page grammar-page grammar-study-page">
    <div class="management-header">
      <div>
        <h2>文法学习</h2>
        <p class="muted total-count">共 {{ total }} 条</p>
      </div>
        <div class="toolbar management-toolbar">
          <div class="toolbar-left">
          <div class="favorite-filter-control">
            <span>只看收藏</span>
            <label class="switch">
              <input v-model="filters.favoritesOnly" type="checkbox" />
              <span class="slider"></span>
            </label>
          </div>
          <select v-model.number="filters.textbookId">
            <option v-for="textbook in textbooks" :key="textbook.id" :value="textbook.id">{{ textbook.name }}</option>
          </select>
          <select v-model="filters.lessonScope" class="lesson-filter-select">
            <option value="all">全部课</option>
            <option value="firstHalf">上半</option>
            <option value="secondHalf">下半</option>
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
          <button @click="notifyPending('练习')">练习</button>
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
        <table class="table grammar-table grammar-study-table">
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
            <template v-for="item in rows" :key="item.id">
              <tr class="grammar-study-row" :class="{ expanded: isExpanded(item.id) }" @click="toggleExpanded(item)">
                <td>
                  <button
                    class="grammar-favorite-button"
                    :class="{ 'is-favorite': item.is_favorite }"
                    type="button"
                    :aria-label="item.is_favorite ? '取消收藏文法' : '收藏文法'"
                    @click.stop="toggleFavorite(item)"
                  >
                    {{ item.is_favorite ? '★' : '☆' }}
                  </button>
                  <span class="grammar-entry-text" :title="grammarDisplay(item)">{{ grammarDisplay(item) }}</span>
                </td>
                <td>{{ item.textbook_name || '-' }}</td>
                <td>第{{ item.lesson_number || '-' }}课</td>
                <td>{{ item.unit_name || '-' }}</td>
                <td class="actions grammar-study-actions">
                  <button class="ghost" @click.stop="toggleExpanded(item)">
                    {{ isExpanded(item.id) ? '收起' : '详情' }}
                  </button>
                  <button class="ghost" @click.stop="notifyPending('练习')">练习</button>
                  <button class="ghost" @click.stop="notifyPending('提问')">提问</button>
                </td>
              </tr>
              <tr v-if="isExpanded(item.id)" class="grammar-study-detail-row">
                <td colspan="5">
                  <div v-if="detailLoadingIds.has(item.id)" class="loading">加载中...</div>
                  <div v-else-if="detailErrors[item.id]" class="error-block grammar-study-detail-error">
                    <p class="error">{{ detailErrors[item.id] }}</p>
                    <button class="ghost" @click.stop="loadDetail(item.id, true)">重试</button>
                  </div>
                  <div v-else-if="detailById[item.id]" class="grammar-study-detail">
                    <div class="grammar-study-detail-section grammar-study-inline-section">
                      <span class="detail-label">意义</span>
                      <p>{{ detailById[item.id].meaning || '-' }}</p>
                    </div>
                    <div class="grammar-study-detail-section grammar-study-inline-section">
                      <span class="detail-label">译文</span>
                      <p>{{ detailById[item.id].translation || '-' }}</p>
                    </div>
                    <div class="grammar-study-detail-section grammar-study-inline-section">
                      <span class="detail-label">接续</span>
                      <p>{{ detailById[item.id].formation || '-' }}</p>
                    </div>
                    <div class="grammar-study-detail-section grammar-study-inline-section">
                      <span class="detail-label">说明</span>
                      <p>{{ detailById[item.id].notes || '-' }}</p>
                    </div>
                    <div class="grammar-study-detail-section">
                      <span class="detail-label">例句</span>
                      <ol v-if="detailById[item.id].examples?.length" class="grammar-study-example-list">
                        <li v-for="(example, index) in detailById[item.id].examples" :key="index">{{ example }}</li>
                      </ol>
                      <p v-else>-</p>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
            <tr v-if="!rows.length">
              <td colspan="5" class="empty">暂无文法条目</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="pagination management-inline-pagination">
      <button class="ghost" :disabled="page === 1 || loading" @click="changePage(page - 1)">上一页</button>
      <label class="management-pagination-jump" for="grammar-study-page-jump">
        第
        <input
          id="grammar-study-page-jump"
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
const expandedIds = ref(new Set());
const detailLoadingIds = ref(new Set());
const detailById = reactive({});
const detailErrors = reactive({});
const toast = reactive({ visible: false, message: '', type: 'info' });

const filters = reactive({
  textbookId: 0,
  lessonScope: 'all',
  unitId: 0,
  favoritesOnly: false
});

const textbooks = computed(() => options.value.textbooks || []);
const selectedTextbook = computed(() => textbooks.value.find((item) => Number(item.id) === Number(filters.textbookId)) || null);
const lessonOptions = computed(() => selectedTextbook.value?.lessons || []);
const selectedLesson = computed(() => lessonOptions.value.find((item) => Number(item.id) === Number(filters.lessonScope)) || null);
const unitOptions = computed(() => (selectedLesson.value ? selectedLesson.value.units || [] : []));
const lessonFilterAll = computed(() => !selectedLesson.value);
const lessonRange = computed(() => {
  if (filters.lessonScope === 'firstHalf') return { min: 1, max: 5 };
  if (filters.lessonScope === 'secondHalf') return { min: 6, max: 10 };
  return { min: '', max: '' };
});
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

function showToast(message, type = 'info') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  setTimeout(() => (toast.visible = false), 3000);
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
  const data = await apiRequest('/api/user/grammar/options');
  options.value = data || { textbooks: [] };
  if (!filters.textbookId && textbooks.value.length) {
    filters.textbookId = textbooks.value[0].id;
  }
}

async function refresh() {
  clearExpanded();
  loading.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/api/user/grammar', {
      params: {
        limit: pageSize.value,
        offset: (page.value - 1) * pageSize.value,
        q: keyword.value,
        textbookId: filters.textbookId || '',
        lessonId: selectedLesson.value?.id || '',
        lessonNumberMin: lessonRange.value.min,
        lessonNumberMax: lessonRange.value.max,
        unitId: lessonFilterAll.value ? '' : filters.unitId || '',
        favoritesOnly: filters.favoritesOnly ? '1' : '',
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

function grammarDisplay(item) {
  const grammar = String(item?.grammar || '').trim();
  const briefLogic = String(item?.brief_logic || '').trim();
  return briefLogic ? `${grammar} <${briefLogic}>` : grammar;
}

function clearExpanded() {
  expandedIds.value = new Set();
  detailLoadingIds.value = new Set();
  Object.keys(detailById).forEach((key) => delete detailById[key]);
  Object.keys(detailErrors).forEach((key) => delete detailErrors[key]);
}

function isExpanded(id) {
  return expandedIds.value.has(id);
}

async function toggleExpanded(item) {
  const nextIds = new Set(expandedIds.value);
  if (nextIds.has(item.id)) {
    nextIds.delete(item.id);
    expandedIds.value = nextIds;
    return;
  }

  nextIds.add(item.id);
  expandedIds.value = nextIds;
  await loadDetail(item.id);
}

async function loadDetail(id, force = false) {
  if (!force && detailById[id]) return;
  delete detailErrors[id];
  detailLoadingIds.value = new Set([...detailLoadingIds.value, id]);
  try {
    detailById[id] = await apiRequest(`/api/user/grammar/${id}`);
  } catch (err) {
    detailErrors[id] = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  } finally {
    const nextLoadingIds = new Set(detailLoadingIds.value);
    nextLoadingIds.delete(id);
    detailLoadingIds.value = nextLoadingIds;
  }
}

async function toggleFavorite(item) {
  const nextFavorite = !item.is_favorite;
  try {
    await apiRequest(`/api/user/grammar/${item.id}/favorite`, {
      method: nextFavorite ? 'POST' : 'DELETE'
    });
    if (filters.favoritesOnly) {
      await refresh();
    } else {
      item.is_favorite = nextFavorite;
    }
    showToast(nextFavorite ? '已收藏文法' : '已取消收藏', 'success');
  } catch (err) {
    handleApiError(err);
  }
}

function notifyPending(label) {
  showToast(`${label}功能暂未开放`);
}

watch(() => filters.textbookId, () => {
  filters.lessonScope = 'all';
  filters.unitId = 0;
  page.value = 1;
  refresh();
});

watch(() => filters.lessonScope, () => {
  filters.unitId = 0;
  page.value = 1;
  refresh();
});

watch(() => [filters.unitId, keyword.value], () => {
  page.value = 1;
  refresh();
});

watch(() => filters.favoritesOnly, () => {
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
