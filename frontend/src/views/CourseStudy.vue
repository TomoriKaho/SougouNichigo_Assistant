<template>
  <section v-if="!studyEntry" class="card management-page text-page course-study-page">
    <div class="management-header">
      <div>
        <h2>课文学习</h2>
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
              <td>
                <span class="course-study-index-text">
                  <span>第</span>
                  <span class="course-study-index-number">{{ item.lesson_number || '-' }}</span>
                  <span>课</span>
                </span>
              </td>
              <td>
                <span class="course-study-index-text">
                  <span>第</span>
                  <span class="course-study-index-number">{{ item.unit_number || '-' }}</span>
                  <span>单元</span>
                </span>
              </td>
              <td>
                <span class="text-entry-title course-study-title" :title="item.title">{{ item.title }}</span>
              </td>
              <td class="actions">
                <button @click="startStudy(item)">开始学习</button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="4" class="empty">暂无课文条目</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="study-footer-bar">
      <span class="study-footer-spacer" aria-hidden="true"></span>
      <div class="pagination management-inline-pagination study-footer-pagination">
        <button class="ghost" :disabled="page === 1 || loading" @click="changePage(page - 1)">上一页</button>
        <label class="management-pagination-jump" for="course-study-page-jump">
          第
          <input
            id="course-study-page-jump"
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
      <span class="muted study-footer-total">共 {{ total }} 条</span>
      <span class="study-footer-spacer" aria-hidden="true"></span>
    </div>

    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
  </section>
  <section v-else class="card course-reading-page">
    <div class="course-reading-layout">
      <div class="course-reading-body">
        <div v-if="studyLoading" class="loading">加载中...</div>
        <div v-else-if="studyError" class="error-block">
          <p class="error">{{ studyError }}</p>
          <button class="ghost" @click="reloadStudy">重试</button>
        </div>
        <article
          v-else
          class="course-reading-content"
          @mouseleave="scheduleHidePopover"
          @mouseup="handleReadingSelection"
          @keyup="handleReadingSelection"
        >
          <h1 class="course-reading-article-title">{{ studyEntry.title }}</h1>
          <div ref="readingTextRef" class="course-reading-text">
            <template v-for="segment in displaySegments" :key="segmentKey(segment)">
              <span
                v-if="segment.type === 'text'"
                class="course-text-segment"
                :class="noteSegmentClass(segment)"
                :data-start="segment.start"
                :data-end="segment.end"
                :data-note-ids="segment.noteIds.join(' ')"
                @click="handleNoteSegmentClick(segment)"
              >{{ segment.text }}</span>
              <span
                v-else
                class="course-annotation"
                :class="[
                  segment.type === 'grammar' ? 'is-grammar' : 'is-vocabulary',
                  ...noteSegmentClass(segment)
                ]"
                :data-start="segment.start"
                :data-end="segment.end"
                :data-note-ids="segment.noteIds.join(' ')"
                @mouseenter="showPopover($event, segment)"
                @mouseover="showPopover($event, segment)"
                @click.stop="handleAnnotatedSegmentClick($event, segment)"
                @mouseleave="scheduleHidePopover"
              >{{ segment.text }}</span>
            </template>
          </div>
        </article>
      </div>
      <aside class="course-reading-tool-window">
        <section class="course-tool-section">
          <div class="course-tool-section-header">
            <h2>选择工具</h2>
            <button
              class="course-selection-toggle"
              :class="{ active: selectionMode }"
              type="button"
              @click="toggleSelectionMode"
            >
              {{ selectionMode ? '已开启' : '开启' }}
            </button>
          </div>
          <p class="course-tool-hint">{{ selectionMode ? '选中课文中的文字后，可以提问或添加笔记。' : '开启后再选择课文文字。' }}</p>
          <div v-if="currentSelection" class="course-selection-card">
            <p>{{ selectionPreview }}</p>
            <div class="course-selection-actions">
              <button type="button" :disabled="assistantOpening" @click="askAboutSelection">提问</button>
              <button class="ghost" type="button" @click="startNoteForSelection">笔记</button>
            </div>
          </div>
        </section>

        <section v-if="noteEditor.open" class="course-tool-section course-note-editor">
          <div class="course-tool-section-header">
            <h2>{{ noteEditor.mode === 'edit' ? '编辑笔记' : '新建笔记' }}</h2>
            <button class="ghost" type="button" @click="closeNoteEditor">关闭</button>
          </div>
          <p class="course-note-selected">{{ noteEditor.selectedText }}</p>
          <textarea v-model="noteEditor.content" rows="5" placeholder="输入笔记内容"></textarea>
          <div class="course-note-editor-actions">
            <button type="button" :disabled="noteSaving" @click="saveNote">{{ noteSaving ? '保存中...' : '保存' }}</button>
            <button
              v-if="noteEditor.mode === 'edit'"
              class="ghost danger"
              type="button"
              :disabled="noteSaving"
              @click="deleteActiveNote"
            >
              删除
            </button>
          </div>
        </section>

        <section class="course-tool-section">
          <div class="course-tool-section-header">
            <h2>笔记</h2>
            <span class="course-tool-count">{{ notes.length }}</span>
          </div>
          <div v-if="notesLoading" class="course-tool-empty">加载中...</div>
          <div v-else-if="notes.length" class="course-note-list">
            <button
              v-for="note in notes"
              :key="note.id"
              class="course-note-list-item"
              :class="{ active: Number(activeNoteId) === Number(note.id) }"
              type="button"
              @click="focusNote(note)"
            >
              <strong>{{ note.selected_text }}</strong>
              <span>{{ note.note_content }}</span>
            </button>
          </div>
          <div v-else class="course-tool-empty">暂无笔记</div>
        </section>

        <section class="course-tool-section">
          <div class="course-tool-section-header">
            <h2>标记过滤</h2>
          </div>
          <div class="course-reading-toolbar">
            <label>
              单词
              <select v-model="markerFilters.words">
                <option value="all">全部</option>
                <option value="key">重点</option>
                <option value="favorite">收藏</option>
                <option value="none">不选</option>
              </select>
            </label>
            <label>
              语法
              <select v-model="markerFilters.grammar">
                <option value="all">全部</option>
                <option value="favorite">收藏</option>
                <option value="none">不选</option>
              </select>
            </label>
          </div>
        </section>
      </aside>
    </div>

    <div
      v-if="activePopover"
      class="course-study-popover"
      :class="activePopover.type === 'grammar' ? 'is-grammar-card' : 'is-vocabulary-card'"
      :style="popoverStyle"
      @mouseenter="cancelHidePopover"
      @mouseleave="scheduleHidePopover"
    >
      <template v-if="activePopover.type === 'vocabulary'">
        <div class="course-popover-header course-vocabulary-popover-header">
          <h3
            class="course-vocabulary-popover-term"
            :class="{ 'is-non-key-word': !activePopover.item.is_key_word }"
          >
            {{ activePopover.item.term }}
          </h3>
          <div v-if="activePopover.item.accent" class="course-vocabulary-popover-side">
            <span v-if="activePopover.item.accent" class="course-vocabulary-popover-accent">
              {{ activePopover.item.accent }}
            </span>
          </div>
        </div>
        <div
          v-if="activePopover.item.supplement || activePopover.item.part_of_speech || metadataTags(activePopover.item).length"
          class="course-vocabulary-popover-meta-row"
          :class="{ 'has-tags': metadataTags(activePopover.item).length }"
        >
          <div class="course-vocabulary-popover-meta-left">
            <p v-if="activePopover.item.supplement" class="course-popover-subtitle">({{ activePopover.item.supplement }})</p>
            <p v-if="activePopover.item.part_of_speech" class="course-popover-meta">&lt;{{ activePopover.item.part_of_speech }}&gt;</p>
          </div>
          <div v-if="metadataTags(activePopover.item).length" class="lexicon-entry-tag-row course-vocabulary-popover-tags">
            <span
              v-for="tag in metadataTags(activePopover.item)"
              :key="tag.key"
              class="lexicon-entry-tag"
              :class="tag.className"
            >
              {{ tag.label }}
            </span>
          </div>
        </div>
        <p class="course-popover-main">{{ activePopover.item.explanation || '-' }}</p>
        <button
          class="word-study-question-button course-popover-question-button"
          type="button"
          aria-label="提问"
          @click="openVocabularyAssistant(activePopover.item)"
        >
          ?
        </button>
        <div class="lexicon-entry-actions word-study-entry-actions course-popover-entry-actions">
          <button
            class="word-study-favorite-button"
            :class="{ 'is-favorite': activePopover.item.is_favorite }"
            type="button"
            :aria-label="activePopover.item.is_favorite ? '取消收藏单词' : '收藏单词'"
            @click="toggleVocabularyFavorite(activePopover.item)"
          >
            {{ activePopover.item.is_favorite ? '★' : '☆' }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="course-popover-header">
          <h3>{{ grammarDisplay(activePopover.item) }}</h3>
        </div>
        <dl class="course-grammar-popover-fields">
          <div>
            <dt>意义</dt>
            <dd>{{ activePopover.item.meaning || '-' }}</dd>
          </div>
          <div>
            <dt>译文</dt>
            <dd>{{ activePopover.item.translation || '-' }}</dd>
          </div>
          <div>
            <dt>接续</dt>
            <dd>{{ activePopover.item.formation || '-' }}</dd>
          </div>
          <div class="course-grammar-popover-example-row">
            <dt>例句</dt>
            <dd>
              <div class="course-grammar-popover-examples">
                <template v-if="grammarExamples(activePopover.item).length">
                  <p
                    v-for="(example, index) in grammarExamples(activePopover.item)"
                    :key="`${activePopover.item.id}-example-${index}`"
                  >
                    {{ index + 1 }}. {{ example }}
                  </p>
                </template>
                <template v-else>-</template>
              </div>
            </dd>
          </div>
        </dl>
        <button
          class="word-study-question-button course-popover-question-button"
          type="button"
          aria-label="提问"
          @click="openGrammarAssistant(activePopover.item)"
        >
          ?
        </button>
        <div class="lexicon-entry-actions word-study-entry-actions course-popover-entry-actions">
          <button
            class="grammar-favorite-button word-study-favorite-button"
            :class="{ 'is-favorite': activePopover.item.is_favorite }"
            type="button"
            :aria-label="activePopover.item.is_favorite ? '取消收藏文法' : '收藏文法'"
            @click="toggleGrammarFavorite(activePopover.item)"
          >
            {{ activePopover.item.is_favorite ? '★' : '☆' }}
          </button>
        </div>
      </template>
    </div>

    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
  </section>
  <div class="study-page-floating-note">如有错误信息，请联系管理员进行修正。</div>
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
const pageSize = ref(50);
const pageJump = ref(1);
const idOrder = ref('asc');
const loading = ref(false);
const error = ref('');
const options = ref({ textbooks: [] });
const studyEntry = ref(null);
const studyVocabulary = ref([]);
const studyGrammar = ref([]);
const studyLoading = ref(false);
const studyError = ref('');
const activePopover = ref(null);
const readingTextRef = ref(null);
const notes = ref([]);
const notesLoading = ref(false);
const selectionMode = ref(false);
const currentSelection = ref(null);
const activeNoteId = ref(null);
const noteSaving = ref(false);
const assistantOpening = ref(false);
const popoverPosition = reactive({ x: 0, y: 0 });
const toast = reactive({ visible: false, message: '', type: 'info' });
let hidePopoverTimer = 0;

const noteEditor = reactive({
  open: false,
  mode: 'create',
  noteId: null,
  startOffset: 0,
  endOffset: 0,
  selectedText: '',
  content: ''
});

const filters = reactive({
  textbookId: 0
});

const markerFilters = reactive({
  words: 'all',
  grammar: 'all'
});

const textbooks = computed(() => options.value.textbooks || []);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const courseReadingMeta = computed(() => (
  studyEntry.value
    ? `${studyEntry.value.textbook_name} / 第${studyEntry.value.lesson_number || '-'}课 / 第${studyEntry.value.unit_number || '-'}单元`
    : ''
));
const popoverStyle = computed(() => ({
  left: `${popoverPosition.x}px`,
  top: `${popoverPosition.y}px`
}));

const wordMarkerItems = computed(() => {
  if (markerFilters.words === 'none') return [];
  return studyVocabulary.value.filter((item) => {
    if (markerFilters.words === 'key') return item.is_key_word;
    if (markerFilters.words === 'favorite') return item.is_favorite;
    return true;
  });
});

const grammarMarkerItems = computed(() => {
  if (markerFilters.grammar === 'none') return [];
  return studyGrammar.value.filter((item) => {
    if (markerFilters.grammar === 'favorite') return item.is_favorite;
    return true;
  });
});

const markerPatterns = computed(() => {
  const seen = new Set();
  const patterns = [];

  grammarMarkerItems.value.forEach((item) => {
    grammarPatterns(item).forEach((pattern) => {
      const text = pattern.text;
      const key = `grammar:${text}`;
      if (seen.has(key)) return;
      seen.add(key);
      patterns.push({ type: 'grammar', ...pattern, item });
    });
  });

  wordMarkerItems.value.forEach((item) => {
    vocabularyPatterns(item).forEach((pattern) => {
      const text = pattern.text;
      const key = `vocabulary:${text}`;
      if (seen.has(key)) return;
      seen.add(key);
      patterns.push({ type: 'vocabulary', ...pattern, item });
    });
  });

  return patterns.sort((a, b) => {
    const lengthDelta = Array.from(b.text).length - Array.from(a.text).length;
    if (lengthDelta) return lengthDelta;
    if (a.type !== b.type) return a.type === 'grammar' ? -1 : 1;
    return Number(a.item.id) - Number(b.item.id);
  });
});

const annotatedSegments = computed(() => annotateText(studyEntry.value?.content || '', markerPatterns.value));
const displaySegments = computed(() => splitSegmentsByNotes(annotatedSegments.value, notes.value));
const selectionPreview = computed(() => {
  const text = String(currentSelection.value?.selectedText || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
});

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

function normalizeMarkerText(value) {
  return String(value || '').trim();
}

function normalizeVocabularyMarkerText(value) {
  return normalizeMarkerText(value)
    .replace(/[▽▼]/g, '')
    .replace(/[‐‑‒–—―－]/g, '-')
    .replace(/\s+/g, '');
}

function vocabularyPatterns(item) {
  const raw = normalizeMarkerText(item?.term);
  if (!raw) return [];
  const candidates = new Map();

  raw
    .split(/[／/、，]/)
    .map((part) => normalizeVocabularyMarkerText(part))
    .forEach((part) => {
      if (!part) return;
      const startsAsSuffix = part.startsWith('-');
      const endsAsPrefix = part.endsWith('-');
      const text = part.replace(/^-+/, '').replace(/-+$/, '');
      if (!text) return;
      const kind = startsAsSuffix ? 'suffix' : endsAsPrefix ? 'prefix' : 'term';
      if (!candidates.has(text)) candidates.set(text, { text, kind });
    });

  return Array.from(candidates.values());
}

function stripGrammarSlot(value) {
  return normalizeMarkerText(value)
    .replace(/[〜~]/g, '')
    .replace(/[（）()]/g, '')
    .replace(/[ＮＶＡ]/g, (char) => ({ 'Ｎ': 'N', 'Ｖ': 'V', 'Ａ': 'A' }[char]))
    .replace(/[NVA][0-9０-９]*/g, '')
    .trim();
}

function grammarPatterns(item) {
  const raw = normalizeMarkerText(item?.grammar);
  if (!raw) return [];
  const candidates = new Set();

  raw
    .split(/[／/]/)
    .map((part) => stripGrammarSlot(part))
    .forEach((part) => {
      if (!part) return;
      part.split(/[、，]/).forEach((piece) => {
        const text = stripGrammarSlot(piece);
        if (Array.from(text).length >= 2) candidates.add(text);
      });
    });

  const compact = stripGrammarSlot(raw);
  if (Array.from(compact).length >= 2 && !/[、，／/]/.test(compact)) candidates.add(compact);
  return Array.from(candidates).map((text) => ({ text, kind: 'grammar' }));
}

function annotateText(text, patterns) {
  if (!text) return [];
  if (!patterns.length) return [{ type: 'text', text, start: 0, end: text.length, noteIds: [] }];
  const segments = [];
  let index = 0;

  while (index < text.length) {
    const match = findMatchingPattern(text, patterns, index);
    if (match) {
      segments.push({
        type: match.type,
        text: match.text,
        item: match.item,
        start: index,
        end: index + match.text.length,
        noteIds: []
      });
      index += match.text.length;
      continue;
    }

    const start = index;
    index += 1;
    while (index < text.length && !findMatchingPattern(text, patterns, index)) {
      index += 1;
    }
    segments.push({
      type: 'text',
      text: text.slice(start, index),
      start,
      end: index,
      noteIds: []
    });
  }

  return segments;
}

function splitSegmentsByNotes(segments, noteRows) {
  const validNotes = noteRows
    .map((note) => ({
      ...note,
      start_offset: Number(note.start_offset),
      end_offset: Number(note.end_offset)
    }))
    .filter((note) => Number.isFinite(note.start_offset) && Number.isFinite(note.end_offset) && note.end_offset > note.start_offset);

  if (!validNotes.length) {
    return segments.map((segment) => ({ ...segment, noteIds: [] }));
  }

  return segments.flatMap((segment) => {
    const overlapping = validNotes.filter((note) => note.start_offset < segment.end && note.end_offset > segment.start);
    if (!overlapping.length) return [{ ...segment, noteIds: [] }];

    const boundaries = new Set([segment.start, segment.end]);
    overlapping.forEach((note) => {
      boundaries.add(Math.max(segment.start, note.start_offset));
      boundaries.add(Math.min(segment.end, note.end_offset));
    });

    const points = Array.from(boundaries).sort((a, b) => a - b);
    const parts = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (end <= start) continue;
      const noteIds = overlapping
        .filter((note) => note.start_offset < end && note.end_offset > start)
        .map((note) => note.id);

      parts.push({
        ...segment,
        text: segment.text.slice(start - segment.start, end - segment.start),
        start,
        end,
        noteIds
      });
    }
    return parts;
  });
}

function segmentKey(segment) {
  const noteKey = segment.noteIds?.length ? segment.noteIds.join('-') : 'none';
  const itemKey = segment.item?.id || 'plain';
  return `${segment.start}-${segment.end}-${segment.type}-${itemKey}-${noteKey}`;
}

function noteSegmentClass(segment) {
  const classes = [];
  if (segment.noteIds?.length) classes.push('is-note-marked');
  if (segment.noteIds?.some((id) => Number(id) === Number(activeNoteId.value))) classes.push('is-active-note');
  return classes;
}

function firstNoteForSegment(segment) {
  const noteId = segment.noteIds?.[0];
  if (!noteId) return null;
  return notes.value.find((note) => Number(note.id) === Number(noteId)) || null;
}

function findMatchingPattern(text, patterns, index) {
  return patterns.find((pattern) => matchesPatternAt(text, index, pattern));
}

function matchesPatternAt(text, index, pattern) {
  if (!text.startsWith(pattern.text, index)) return false;
  if (pattern.type === 'grammar') return hasGrammarContext(text, index, pattern);
  return hasVocabularyContext(text, index, pattern);
}

function charBefore(text, index) {
  if (index <= 0) return '';
  return text[index - 1] || '';
}

function charAfter(text, index, markerText) {
  return text[index + markerText.length] || '';
}

function isJapaneseWordChar(char) {
  return !!char && /[\u3040-\u30ff\u3400-\u9fff々〆ヶーA-Za-z0-9]/u.test(char);
}

function isKana(char) {
  return !!char && /[\u3040-\u30ffー]/u.test(char);
}

function isKatakana(char) {
  return !!char && /[\u30a0-\u30ffー]/u.test(char);
}

function isKanji(char) {
  return !!char && /[\u3400-\u9fff々〆ヶ]/u.test(char);
}

function isPunctuationBoundary(char) {
  return !char || /[\s、。，．,.!?！？;；:：「」『』（）()［］\[\]【】〈〉《》〔〕…・\n\r\t]/u.test(char);
}

function isParticleBoundary(char) {
  return !!char && /[はがをにへでとのもやかねよぞなさわ]/u.test(char);
}

function isHonorificStart(text, index) {
  return ['さん', 'ちゃん', 'くん', '君', '氏', '先生'].some((suffix) => text.startsWith(suffix, index));
}

function isLeftBoundary(char) {
  return !isJapaneseWordChar(char) || isPunctuationBoundary(char) || isParticleBoundary(char);
}

function isRightBoundary(text, index, markerText) {
  const next = charAfter(text, index, markerText);
  const nextIndex = index + markerText.length;
  return (
    !isJapaneseWordChar(next)
    || isPunctuationBoundary(next)
    || isParticleBoundary(next)
    || isHonorificStart(text, nextIndex)
    || isInflectionBoundaryStart(text, nextIndex)
  );
}

function isInflectionBoundaryStart(text, index) {
  return [
    'だ',
    'だった',
    'です',
    'でした',
    'でし',
    'で',
    'な',
    'に',
    'と',
    'さ',
    'く',
    'かった',
    'けれ',
    'そう',
    'そば',
    'ほど',
    'くらい',
    'ぐらい'
  ].some((suffix) => text.startsWith(suffix, index));
}

function hasVocabularyContext(text, index, pattern) {
  const prev = charBefore(text, index);
  const next = charAfter(text, index, pattern.text);
  const length = Array.from(pattern.text).length;

  if (pattern.kind === 'prefix') {
    return isLeftBoundary(prev) && isJapaneseWordChar(next) && !isPunctuationBoundary(next);
  }

  if (pattern.kind === 'suffix') {
    return isJapaneseWordChar(prev) && isRightBoundary(text, index, pattern.text);
  }

  if (length === 1) {
    const nextIndex = index + pattern.text.length;
    const hasStrictLeft = !isJapaneseWordChar(prev) || isPunctuationBoundary(prev);
    const hasStrictRight = !isJapaneseWordChar(next) || isPunctuationBoundary(next) || isParticleBoundary(next) || isHonorificStart(text, nextIndex);
    if (pattern.item?.is_proper_noun) return hasStrictLeft && hasStrictRight;
    if (isKanji(pattern.text)) return hasStrictLeft && hasStrictRight;
    return hasStrictLeft && (!isJapaneseWordChar(next) || isPunctuationBoundary(next));
  }

  if (!isLeftBoundary(prev)) return false;
  if (isKatakana(prev) && isKatakana(pattern.text[0])) return false;
  if (isKatakana(next) && isKatakana(pattern.text[pattern.text.length - 1])) return false;
  return isRightBoundary(text, index, pattern.text);
}

function hasGrammarContext(text, index, pattern) {
  const prev = charBefore(text, index);
  const next = charAfter(text, index, pattern.text);
  const first = pattern.text[0];
  const last = pattern.text[pattern.text.length - 1];

  if (isKatakana(prev) || isKatakana(next)) return false;
  if (/[A-Za-z0-9]/.test(prev) || /[A-Za-z0-9]/.test(next)) return false;

  const attachesToPrevious = [
    'は',
    'が',
    'を',
    'に',
    'へ',
    'で',
    'と',
    'の',
    'も',
    'より',
    'から',
    'まで',
    'ば',
    'たら',
    'なら',
    'そば',
    'ほど',
    'くらい',
    'ぐらい'
  ].some((prefix) => pattern.text.startsWith(prefix));
  if (!attachesToPrevious && isJapaneseWordChar(prev) && !isParticleBoundary(prev)) return false;
  if (isKana(prev) && isKana(first) && !attachesToPrevious && !isParticleBoundary(prev)) return false;
  if (isKanji(next) && isKanji(last)) return false;

  return true;
}

async function loadOptions() {
  const data = await apiRequest('/api/user/texts/options');
  options.value = data || { textbooks: [] };
  if (!filters.textbookId && textbooks.value.length) {
    filters.textbookId = textbooks.value[0].id;
  }
}

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/api/user/texts', {
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

async function startStudy(item) {
  studyEntry.value = item;
  studyVocabulary.value = [];
  studyGrammar.value = [];
  notes.value = [];
  studyError.value = '';
  activePopover.value = null;
  resetSelectionState();
  await loadStudy(item.id);
}

async function reloadStudy() {
  if (!studyEntry.value?.id) return;
  await loadStudy(studyEntry.value.id);
}

async function loadStudy(id) {
  studyLoading.value = true;
  studyError.value = '';
  notesLoading.value = true;
  try {
    const [data, noteData] = await Promise.all([
      apiRequest(`/api/user/texts/${id}/study`),
      apiRequest(`/api/user/texts/${id}/notes`)
    ]);
    studyEntry.value = data.item;
    studyVocabulary.value = data.vocabulary || [];
    studyGrammar.value = data.grammar || [];
    notes.value = noteData.rows || [];
  } catch (err) {
    studyError.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  } finally {
    studyLoading.value = false;
    notesLoading.value = false;
  }
}

function closeStudy() {
  activePopover.value = null;
  studyEntry.value = null;
  studyVocabulary.value = [];
  studyGrammar.value = [];
  notes.value = [];
  studyError.value = '';
  resetSelectionState();
  updateTopbarTitle('');
}

function resetSelectionState() {
  currentSelection.value = null;
  activeNoteId.value = null;
  closeNoteEditor();
  const selection = window.getSelection?.();
  if (selection?.removeAllRanges) selection.removeAllRanges();
}

function closeNoteEditor() {
  noteEditor.open = false;
  noteEditor.mode = 'create';
  noteEditor.noteId = null;
  noteEditor.startOffset = 0;
  noteEditor.endOffset = 0;
  noteEditor.selectedText = '';
  noteEditor.content = '';
}

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value;
  if (!selectionMode.value) {
    currentSelection.value = null;
    const selection = window.getSelection?.();
    if (selection?.removeAllRanges) selection.removeAllRanges();
  }
}

function updateTopbarTitle(title) {
  window.dispatchEvent(new CustomEvent('topbar:title-override', {
    detail: {
      title,
      backLabel: title ? '返回列表' : ''
    }
  }));
}

function handleTopbarBack() {
  if (studyEntry.value) closeStudy();
}

function rangeOffsetWithin(container, node, offset) {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(node, offset);
  const length = range.toString().length;
  range.detach?.();
  return length;
}

function handleReadingSelection() {
  if (!selectionMode.value || !readingTextRef.value || !studyEntry.value?.content) return;
  window.setTimeout(() => {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      currentSelection.value = null;
      return;
    }

    const range = selection.getRangeAt(0);
    const container = readingTextRef.value;
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
      currentSelection.value = null;
      return;
    }

    const content = String(studyEntry.value.content || '');
    const startOffset = rangeOffsetWithin(container, range.startContainer, range.startOffset);
    const endOffset = rangeOffsetWithin(container, range.endContainer, range.endOffset);
    const start = Math.max(0, Math.min(startOffset, endOffset));
    const end = Math.min(content.length, Math.max(startOffset, endOffset));
    const selectedText = content.slice(start, end);

    if (!selectedText.trim()) {
      currentSelection.value = null;
      return;
    }

    currentSelection.value = {
      startOffset: start,
      endOffset: end,
      selectedText
    };
    activeNoteId.value = null;
  }, 0);
}

function handleNoteSegmentClick(segment) {
  const note = firstNoteForSegment(segment);
  if (note) focusNote(note);
}

function handleAnnotatedSegmentClick(event, segment) {
  const note = firstNoteForSegment(segment);
  if (note) {
    focusNote(note);
    return;
  }
  showPopover(event, segment);
}

function startNoteForSelection() {
  if (!currentSelection.value) {
    showToast('请先选择课文中的文字', 'error');
    return;
  }

  activeNoteId.value = null;
  noteEditor.open = true;
  noteEditor.mode = 'create';
  noteEditor.noteId = null;
  noteEditor.startOffset = currentSelection.value.startOffset;
  noteEditor.endOffset = currentSelection.value.endOffset;
  noteEditor.selectedText = currentSelection.value.selectedText;
  noteEditor.content = '';
}

function editNote(note) {
  activeNoteId.value = note.id;
  noteEditor.open = true;
  noteEditor.mode = 'edit';
  noteEditor.noteId = note.id;
  noteEditor.startOffset = note.start_offset;
  noteEditor.endOffset = note.end_offset;
  noteEditor.selectedText = note.selected_text;
  noteEditor.content = note.note_content;
}

async function focusNote(note) {
  editNote(note);
  await nextTick();
  const target = readingTextRef.value?.querySelector(`[data-note-ids~="${note.id}"]`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}

async function saveNote() {
  if (!studyEntry.value?.id || noteSaving.value) return;
  const noteContent = String(noteEditor.content || '').trim();
  if (!noteContent) {
    showToast('请输入笔记内容', 'error');
    return;
  }

  noteSaving.value = true;
  try {
    if (noteEditor.mode === 'edit' && noteEditor.noteId) {
      const data = await apiRequest(`/api/user/text-notes/${noteEditor.noteId}`, {
        method: 'PATCH',
        body: { noteContent }
      });
      notes.value = notes.value.map((note) => (Number(note.id) === Number(data.item.id) ? data.item : note));
      activeNoteId.value = data.item.id;
      editNote(data.item);
      showToast('笔记已更新', 'success');
      return;
    }

    const data = await apiRequest(`/api/user/texts/${studyEntry.value.id}/notes`, {
      method: 'POST',
      body: {
        startOffset: noteEditor.startOffset,
        endOffset: noteEditor.endOffset,
        selectedText: noteEditor.selectedText,
        noteContent
      }
    });
    notes.value = [...notes.value, data.item].sort((a, b) => Number(a.start_offset) - Number(b.start_offset) || Number(a.id) - Number(b.id));
    currentSelection.value = null;
    activeNoteId.value = data.item.id;
    editNote(data.item);
    showToast('笔记已保存', 'success');
  } catch (err) {
    handleApiError(err);
  } finally {
    noteSaving.value = false;
  }
}

async function deleteActiveNote() {
  if (!noteEditor.noteId || noteSaving.value) return;
  noteSaving.value = true;
  try {
    await apiRequest(`/api/user/text-notes/${noteEditor.noteId}`, { method: 'DELETE' });
    notes.value = notes.value.filter((note) => Number(note.id) !== Number(noteEditor.noteId));
    activeNoteId.value = null;
    closeNoteEditor();
    showToast('笔记已删除', 'success');
  } catch (err) {
    handleApiError(err);
  } finally {
    noteSaving.value = false;
  }
}

async function askAboutSelection() {
  if (!studyEntry.value?.id || !currentSelection.value || assistantOpening.value) return;
  assistantOpening.value = true;
  try {
    const data = await apiRequest(`/api/user/assistant/context/text/${studyEntry.value.id}/selection`, {
      method: 'POST',
      timeout: 30000,
      body: {
        startOffset: currentSelection.value.startOffset,
        endOffset: currentSelection.value.endOffset,
        selectedText: currentSelection.value.selectedText
      }
    });
    const conversationId = data?.conversation?.id;
    if (!conversationId) throw new Error('对话信息无效');
    window.dispatchEvent(new CustomEvent('assistant:open-conversation', {
      detail: { id: conversationId }
    }));
  } catch (err) {
    handleApiError(err);
  } finally {
    assistantOpening.value = false;
  }
}

function resolvePopoverPosition(anchorX, anchorY, width, height) {
  const margin = 16;
  const verticalGap = 16;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const x = Math.min(Math.max(margin, anchorX + 14), maxX);
  const belowY = anchorY + verticalGap;
  const aboveY = anchorY - height - verticalGap;
  const hasRoomBelow = belowY + height <= window.innerHeight - margin;
  const rawY = hasRoomBelow ? belowY : aboveY;
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  const y = Math.min(Math.max(margin, rawY), maxY);
  return { x, y };
}

async function showPopover(event, segment) {
  cancelHidePopover();
  const width = Math.min(segment.type === 'grammar' ? 390 : 330, window.innerWidth - 32);
  const estimatedHeight = segment.type === 'grammar' ? 290 : 210;
  const initialPosition = resolvePopoverPosition(event.clientX, event.clientY, width, estimatedHeight);
  popoverPosition.x = initialPosition.x;
  popoverPosition.y = initialPosition.y;
  activePopover.value = {
    type: segment.type,
    item: segment.item
  };
  await nextTick();
  if (!activePopover.value || activePopover.value.item !== segment.item || activePopover.value.type !== segment.type) return;
  const popover = document.querySelector('.course-study-popover');
  if (!popover) return;
  const rect = popover.getBoundingClientRect();
  const measuredPosition = resolvePopoverPosition(event.clientX, event.clientY, Math.ceil(rect.width), Math.ceil(rect.height));
  popoverPosition.x = measuredPosition.x;
  popoverPosition.y = measuredPosition.y;
}

function scheduleHidePopover() {
  cancelHidePopover();
  hidePopoverTimer = window.setTimeout(() => {
    activePopover.value = null;
  }, 180);
}

function cancelHidePopover() {
  if (!hidePopoverTimer) return;
  window.clearTimeout(hidePopoverTimer);
  hidePopoverTimer = 0;
}

function metadataTags(item) {
  const tags = [];
  if (item?.is_proper_noun) tags.push({ key: 'proper-noun', label: '专有名词', className: 'tag-proper-noun' });
  if (item?.is_onomatopoeia) tags.push({ key: 'onomatopoeia', label: 'オノマトペ', className: 'tag-onomatopoeia' });
  if (item?.is_loanword) tags.push({ key: 'loanword', label: '外来词', className: 'tag-loanword' });
  if (item?.has_kanji) tags.push({ key: 'kanji-word', label: '汉字词', className: 'tag-kanji-word' });
  return tags;
}

function grammarDisplay(item) {
  const grammar = String(item?.grammar || '').trim();
  const briefLogic = String(item?.brief_logic || '').trim();
  return briefLogic ? `${grammar} <${briefLogic}>` : grammar;
}

function grammarExamples(item) {
  if (Array.isArray(item?.examples)) {
    return item.examples.map((example) => String(example || '').trim()).filter(Boolean);
  }
  const text = String(item?.examples || '').trim();
  return text ? [text] : [];
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

function openGrammarAssistant(item) {
  if (!item?.id) {
    showToast('文法条目信息无效', 'error');
    return;
  }
  window.dispatchEvent(new CustomEvent('assistant:context', {
    detail: {
      contextType: 'grammar',
      id: item.id
    }
  }));
}

function updateVocabularyFavorite(id, nextFavorite) {
  studyVocabulary.value = studyVocabulary.value.map((item) => (
    Number(item.id) === Number(id) ? { ...item, is_favorite: nextFavorite } : item
  ));
  if (activePopover.value?.type === 'vocabulary' && Number(activePopover.value.item.id) === Number(id)) {
    activePopover.value = {
      ...activePopover.value,
      item: { ...activePopover.value.item, is_favorite: nextFavorite }
    };
  }
}

function updateGrammarFavorite(id, nextFavorite) {
  studyGrammar.value = studyGrammar.value.map((item) => (
    Number(item.id) === Number(id) ? { ...item, is_favorite: nextFavorite } : item
  ));
  if (activePopover.value?.type === 'grammar' && Number(activePopover.value.item.id) === Number(id)) {
    activePopover.value = {
      ...activePopover.value,
      item: { ...activePopover.value.item, is_favorite: nextFavorite }
    };
  }
}

async function toggleVocabularyFavorite(item) {
  const nextFavorite = !item.is_favorite;
  try {
    await apiRequest(`/api/user/vocabulary/${item.id}/favorite`, {
      method: nextFavorite ? 'POST' : 'DELETE'
    });
    updateVocabularyFavorite(item.id, nextFavorite);
    showToast(nextFavorite ? '已收藏单词' : '已取消收藏', 'success');
  } catch (err) {
    handleApiError(err);
  }
}

async function toggleGrammarFavorite(item) {
  const nextFavorite = !item.is_favorite;
  try {
    await apiRequest(`/api/user/grammar/${item.id}/favorite`, {
      method: nextFavorite ? 'POST' : 'DELETE'
    });
    updateGrammarFavorite(item.id, nextFavorite);
    showToast(nextFavorite ? '已收藏文法' : '已取消收藏', 'success');
  } catch (err) {
    handleApiError(err);
  }
}

watch(() => filters.textbookId, () => {
  page.value = 1;
  refresh();
});

watch(courseReadingMeta, (title) => {
  updateTopbarTitle(title);
});

onMounted(async () => {
  window.addEventListener('topbar:back', handleTopbarBack);
  try {
    await loadOptions();
    await refresh();
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  }
});

onBeforeUnmount(() => {
  cancelHidePopover();
  window.removeEventListener('topbar:back', handleTopbarBack);
  updateTopbarTitle('');
});
</script>
