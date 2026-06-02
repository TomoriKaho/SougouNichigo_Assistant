<template>
  <section class="card lexicon-page word-study-page">
    <div class="header-row">
      <div class="header-copy">
        <h2>单词学习</h2>
      </div>
      <div class="toolbar">
        <div class="toolbar-left lexicon-filter-bar">
          <div class="favorite-filter-control word-study-inline-favorite-filter">
            <span>只看收藏</span>
            <label class="switch">
              <input v-model="filters.favoritesOnly" type="checkbox" />
              <span class="slider"></span>
            </label>
          </div>
          <div class="favorite-filter-control word-study-inline-favorite-filter">
            <span>只看重点</span>
            <span class="filter-help-tooltip">
              <span class="filter-help-badge">?</span>
              <span class="filter-help-tooltip-bubble">由管理员老师标记为重点的单词，作为参考</span>
            </span>
            <label class="switch">
              <input v-model="filters.keyOnly" type="checkbox" />
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
            <option v-for="lesson in lessonOptions" :key="lesson.id" :value="String(lesson.id)">
              第{{ lesson.lesson_number }}课
            </option>
          </select>
          <select v-model.number="filters.unitId" class="word-study-compact-select" :disabled="lessonFilterAll">
            <option :value="0">全部单元</option>
            <option v-for="unit in unitOptions" :key="unit.id" :value="unit.id">
              {{ unit.name }}
            </option>
          </select>
          <select v-model="filters.tableType" class="word-study-compact-select" :disabled="lessonFilterAll">
            <option value="all">全部词表</option>
            <option value="new">新出単語</option>
            <option value="practice">練習用単語</option>
          </select>
          <input v-model.trim="keyword" placeholder="搜索词条/中文翻译" @keydown.enter.prevent="refresh" />
          <button class="ghost word-study-toolbar-button" @click="toggleIdOrder" :disabled="loading">
            {{ idOrder === 'asc' ? '倒序查看' : '顺序查看' }}
          </button>
          <button class="word-study-toolbar-button word-study-practice-button" @click="notifyPending" :disabled="loading">练习</button>
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
          <article v-for="item in rows" :key="item.id" class="lexicon-entry-card" :data-entry-id="item.id">
            <div class="lexicon-entry-main" :class="{ 'is-scrollable': scrollableEntryIds.has(item.id) }">
              <div
                class="lexicon-card-header word-study-card-header"
                :class="{ 'has-meta': hasWordStudyMeta(item) }"
              >
                <h3 class="lexicon-entry-term" :class="{ 'is-non-key-word': !item.is_key_word }" :title="item.term">
                  <span>{{ item.term }}</span>
                  <span v-if="item.accent" class="lexicon-entry-accent">{{ item.accent }}</span>
                </h3>
                <div
                  v-if="hasWordStudyMeta(item)"
                  class="word-study-entry-meta"
                >
                  <span v-if="partOfSpeechMeta(item)" class="lexicon-entry-tag word-study-pos-tag">
                    {{ partOfSpeechMeta(item) }}
                  </span>
                  <div v-if="metadataTags(item).length" class="lexicon-entry-tag-row word-study-entry-tag-row">
                    <span
                      v-for="tag in metadataTags(item)"
                      :key="tag.key"
                      class="lexicon-entry-tag"
                      :class="tag.className"
                    >
                      {{ tag.label }}
                    </span>
                  </div>
                </div>
              </div>
              <p v-if="item.supplement" class="lexicon-entry-supplement">({{ item.supplement }})</p>
              <p class="lexicon-entry-translation">{{ item.explanation || '-' }}</p>
            </div>
            <button
              class="word-study-question-button"
              type="button"
              aria-label="提问"
              @click="openVocabularyAssistant(item)"
            >
              ?
            </button>
            <div class="lexicon-entry-actions word-study-entry-actions">
              <button
                class="word-study-favorite-button"
                :class="{ 'is-favorite': item.is_favorite }"
                type="button"
                :aria-label="item.is_favorite ? '取消收藏单词' : '收藏单词'"
                @click="toggleFavorite(item)"
              >
                {{ item.is_favorite ? '★' : '☆' }}
              </button>
            </div>
          </article>
        </div>
        <div v-else class="empty">暂无条目</div>
      </div>
    </div>

    <div class="study-footer-bar word-study-footer-bar">
      <span class="muted study-footer-total">共 {{ total }} 条</span>
      <div class="pagination management-inline-pagination study-footer-pagination">
        <button class="ghost" :disabled="page === 1 || loading" @click="changePage(page - 1)">上一页</button>
        <label class="management-pagination-jump" for="word-study-page-jump">
          第
          <input
            id="word-study-page-jump"
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
      <span class="study-footer-spacer" aria-hidden="true"></span>
    </div>

    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest, ApiError } from '../utils/apiClient';
import { useAuth } from '../composables/useAuth';

const { logout } = useAuth();
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
const scrollableEntryIds = ref(new Set());
const toast = reactive({ visible: false, message: '', type: 'info' });

const filters = reactive({
  textbookId: 0,
  lessonScope: 'all',
  unitId: 0,
  tableType: 'all',
  favoritesOnly: false,
  keyOnly: false
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

async function loadOptions() {
  const data = await apiRequest('/api/user/vocabulary/options');
  options.value = data || { textbooks: [], tableTypes: [] };
  if (!filters.textbookId && textbooks.value.length) {
    filters.textbookId = textbooks.value[0].id;
  }
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/api/user/vocabulary', {
      params: {
        limit: pageSize.value,
        offset: (page.value - 1) * pageSize.value,
        q: keyword.value,
        textbookId: filters.textbookId || '',
        lessonId: selectedLesson.value?.id || '',
        lessonNumberMin: lessonRange.value.min,
        lessonNumberMax: lessonRange.value.max,
        unitId: lessonFilterAll.value ? '' : filters.unitId || '',
        tableType: lessonFilterAll.value ? 'all' : filters.tableType,
        favoritesOnly: filters.favoritesOnly ? '1' : '',
        keyOnly: filters.keyOnly ? '1' : '',
        id_order: idOrder.value
      }
    });
    rows.value = data.rows || [];
    total.value = data.total || 0;
    pageJump.value = page.value;
    measureCardScrollbars();
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

function notifyPending() {
  showToast('练习功能暂未开放');
}

function openVocabularyAssistant(item) {
  if (!item?.id) {
    showToast('词条信息无效', 'error');
    return;
  }
  window.dispatchEvent(new CustomEvent('assistant:context', {
    detail: {
      contextType: 'vocabulary',
      id: item.id
    }
  }));
}

function partOfSpeechMeta(item) {
  const partOfSpeech = String(item?.part_of_speech || '').trim();
  return partOfSpeech ? `<${partOfSpeech}>` : '';
}

function metadataTags(item) {
  const tags = [];
  if (item?.is_proper_noun) tags.push({ key: 'proper-noun', label: '专有名词', className: 'tag-proper-noun' });
  if (item?.is_onomatopoeia) tags.push({ key: 'onomatopoeia', label: 'オノマトペ', className: 'tag-onomatopoeia' });
  if (item?.is_loanword) tags.push({ key: 'loanword', label: '外来词', className: 'tag-loanword' });
  return tags;
}

function hasWordStudyMeta(item) {
  return Boolean(partOfSpeechMeta(item) || metadataTags(item).length);
}

async function toggleFavorite(item) {
  const nextFavorite = !item.is_favorite;
  try {
    await apiRequest(`/api/user/vocabulary/${item.id}/favorite`, {
      method: nextFavorite ? 'POST' : 'DELETE'
    });
    if (filters.favoritesOnly) {
      await refresh();
    } else {
      item.is_favorite = nextFavorite;
    }
    showToast(nextFavorite ? '已收藏单词' : '已取消收藏', 'success');
  } catch (err) {
    handleApiError(err);
  }
}

async function measureCardScrollbars() {
  await nextTick();
  const nextScrollableIds = new Set();
  document.querySelectorAll('.lexicon-entry-card').forEach((card) => {
    const entryId = Number(card.getAttribute('data-entry-id'));
    const body = card.querySelector('.lexicon-entry-main');
    if (entryId && body && body.scrollHeight > body.clientHeight + 1) {
      nextScrollableIds.add(entryId);
    }
  });
  scrollableEntryIds.value = nextScrollableIds;
}

watch(() => filters.textbookId, () => {
  filters.lessonScope = 'all';
  filters.unitId = 0;
  filters.tableType = 'all';
  page.value = 1;
  refresh();
});

watch(() => filters.lessonScope, () => {
  filters.unitId = 0;
  if (lessonFilterAll.value) {
    filters.tableType = 'all';
  }
  page.value = 1;
  refresh();
});

watch(() => [filters.unitId, filters.tableType, keyword.value], () => {
  page.value = 1;
  refresh();
});

watch(() => filters.favoritesOnly, () => {
  page.value = 1;
  refresh();
});

watch(() => filters.keyOnly, () => {
  page.value = 1;
  refresh();
});

onMounted(async () => {
  window.addEventListener('resize', measureCardScrollbars);
  try {
    await loadOptions();
    await refresh();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', measureCardScrollbars);
});
</script>
