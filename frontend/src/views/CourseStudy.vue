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
          :class="{ 'is-selection-mode': selectionMode }"
          @mousedown="beginReadingSelectionDrag"
          @touchstart.passive="beginReadingSelectionDrag"
          @mouseleave="scheduleHidePopover"
          @mouseup="handleReadingMouseUp"
          @touchend="handleReadingMouseUp"
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
                @mouseenter="showNoteForSegment($event, segment)"
                @mouseover="showNoteForSegment($event, segment)"
                @mouseleave="scheduleHideNotePreview"
                @click="handleNoteSegmentClick($event, segment)"
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
                @mouseenter="handleAnnotatedSegmentHover($event, segment)"
                @mouseover="handleAnnotatedSegmentHover($event, segment)"
                @click.stop="handleAnnotatedSegmentClick($event, segment)"
                @mouseleave="handleAnnotatedSegmentLeave"
              >{{ segment.text }}</span>
            </template>
          </div>
        </article>
      </div>
      <aside class="course-reading-tool-window">
        <section class="course-tool-section course-selection-tool-section">
          <div class="course-selection-tool-row">
            <button
              class="course-selection-toggle"
              :class="{ active: selectionMode }"
              type="button"
              @click="toggleSelectionMode"
            >
              {{ selectionMode ? '选择中' : '选择工具' }}
            </button>
            <p class="course-tool-hint">选中文字后，可以提问或添加笔记。</p>
          </div>
        </section>

        <section class="course-tool-section course-practice-section">
          <div class="course-practice-row">
            <button class="course-practice-start-button" type="button" disabled>开始练习</button>
            <h2>课文内容练习</h2>
          </div>
        </section>

        <section class="course-tool-section course-notes-section">
          <div class="course-tool-section-header">
            <h2>提问历史</h2>
            <span class="course-tool-count">{{ questionHistoryRows.length }}</span>
          </div>
          <div v-if="questionHistoryLoading" class="course-tool-empty">加载中...</div>
          <div v-else-if="questionHistoryRows.length" class="course-note-list">
            <button
              v-for="item in questionHistoryRows"
              :key="item.id"
              class="course-note-list-item"
              :class="{ active: Number(activeQuestionConversationId) === Number(item.id) }"
              type="button"
              @click="openQuestionHistoryConversation(item)"
            >
              <strong class="course-note-list-content">{{ questionHistorySelectionLabel(item) }}</strong>
              <span class="course-note-list-source">{{ questionHistoryQuestionLabel(item) }}</span>
            </button>
          </div>
          <div v-else class="course-tool-empty">暂无提问历史</div>
        </section>

        <p class="course-context-question-hint">无需课文上下文的问题，建议直接在AI助手提问</p>

        <section class="course-tool-section course-marker-filter-section">
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
      v-if="currentSelection && !noteEditor.open"
      class="course-selection-floating-actions"
      :style="selectionActionsStyle"
      @mousedown.prevent
    >
      <button type="button" :disabled="assistantOpening" @click="askAboutSelection">提问</button>
      <button class="ghost" type="button" @click="startNoteForSelection">笔记</button>
    </div>

    <div
      v-if="noteEditor.open"
      class="course-note-floating-editor"
      :class="{ 'is-view-mode': noteEditor.mode === 'view' }"
      :style="noteEditorStyle"
      @mousedown.stop
      @click.stop
      @mouseenter="cancelHideNotePreview"
      @mouseleave="closeNotePreview"
    >
      <div
        v-if="noteEditor.mode === 'view'"
        class="course-note-floating-view"
        @click="promoteViewedNoteToEdit($event)"
      >
        {{ noteEditor.content }}
      </div>
      <template v-else>
      <div class="course-note-floating-header" @mousedown="startNoteEditorDrag">
        <h2>{{ noteEditor.mode === 'edit' ? '编辑笔记' : '新建笔记' }}</h2>
        <div class="course-note-editor-header-actions" @mousedown.stop>
          <button
            v-if="noteEditor.mode === 'edit'"
            class="ghost danger"
            type="button"
            :disabled="noteSaving"
            @click="deleteActiveNote"
          >
            删除
          </button>
          <button type="button" :disabled="noteSaving" @click="saveNote">{{ noteSaving ? '保存中...' : '保存' }}</button>
          <button class="ghost" type="button" @click="closeNoteEditor">关闭</button>
        </div>
      </div>
      <textarea ref="noteEditorTextareaRef" v-model="noteEditor.content" placeholder="输入笔记内容"></textarea>
      </template>
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
  <div class="study-page-floating-note">如有错误内容，请联系管理员进行修正。</div>
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
const noteEditorTextareaRef = ref(null);
const notes = ref([]);
const notesLoading = ref(false);
const questionHistoryRows = ref([]);
const questionHistoryLoading = ref(false);
const selectionMode = ref(false);
const currentSelection = ref(null);
const readingSelectionDragging = ref(false);
const activeNoteId = ref(null);
const activeQuestionConversationId = ref(null);
const noteSaving = ref(false);
const assistantOpening = ref(false);
const popoverPosition = reactive({ x: 0, y: 0 });
const selectionActionsPosition = reactive({ x: 0, y: 0 });
const toast = reactive({ visible: false, message: '', type: 'info' });
const NOTE_EDITOR_TOOLBAR_HEIGHT = 46;
let hidePopoverTimer = 0;
let hideNotePreviewTimer = 0;
let noteEditorDragState = null;

const noteEditor = reactive({
  open: false,
  mode: 'create',
  noteId: null,
  startOffset: 0,
  endOffset: 0,
  selectedText: '',
  content: '',
  x: 0,
  y: 0,
  width: 320,
  height: 190
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
const selectionActionsStyle = computed(() => ({
  left: `${selectionActionsPosition.x}px`,
  top: `${selectionActionsPosition.y}px`
}));
const noteEditorStyle = computed(() => ({
  left: `${noteEditor.x}px`,
  top: `${noteEditor.y}px`,
  width: `${noteEditor.width}px`,
  height: `${noteEditorOuterHeight()}px`
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
  questionHistoryRows.value = [];
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
  questionHistoryLoading.value = true;
  try {
    const [data, noteData, questionHistoryData] = await Promise.all([
      apiRequest(`/api/user/texts/${id}/study`),
      apiRequest(`/api/user/texts/${id}/notes`),
      loadQuestionHistoryRows(id)
    ]);
    studyEntry.value = data.item;
    studyVocabulary.value = data.vocabulary || [];
    studyGrammar.value = data.grammar || [];
    notes.value = noteData.rows || [];
    questionHistoryRows.value = filterTextSelectionQuestionHistory(questionHistoryData.rows || [], id);
  } catch (err) {
    studyError.value = err instanceof ApiError ? err.message : '加载失败';
    handleApiError(err);
  } finally {
    studyLoading.value = false;
    notesLoading.value = false;
    questionHistoryLoading.value = false;
  }
}

function loadQuestionHistoryRows(textId) {
  return apiRequest('/api/user/assistant/conversations', {
    params: {
      contextType: 'text',
      contextId: textId,
      limit: 200,
      offset: 0
    },
    timeout: 30000
  });
}

function isTextSelectionQuestionHistory(item, textId) {
  const snapshot = item?.context_snapshot || {};
  const selectedText = String(snapshot.selected_text || snapshot.selection?.selectedText || '').trim();
  const startOffset = Number(snapshot.start_offset ?? snapshot.startOffset);
  const endOffset = Number(snapshot.end_offset ?? snapshot.endOffset);
  return (
    item?.context_type === 'text'
    && Number(item.context_id) === Number(textId)
    && selectedText.length > 0
    && Number.isFinite(startOffset)
    && Number.isFinite(endOffset)
    && endOffset > startOffset
  );
}

function filterTextSelectionQuestionHistory(rows, textId) {
  return rows.filter((item) => isTextSelectionQuestionHistory(item, textId));
}

async function refreshQuestionHistory() {
  if (!studyEntry.value?.id) return;
  questionHistoryLoading.value = true;
  try {
    const data = await loadQuestionHistoryRows(studyEntry.value.id);
    questionHistoryRows.value = filterTextSelectionQuestionHistory(data.rows || [], studyEntry.value.id);
  } catch (err) {
    handleApiError(err);
  } finally {
    questionHistoryLoading.value = false;
  }
}

function closeStudy() {
  activePopover.value = null;
  studyEntry.value = null;
  studyVocabulary.value = [];
  studyGrammar.value = [];
  notes.value = [];
  questionHistoryRows.value = [];
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
  cancelHideNotePreview();
  noteEditor.open = false;
  noteEditor.mode = 'create';
  noteEditor.noteId = null;
  noteEditor.startOffset = 0;
  noteEditor.endOffset = 0;
  noteEditor.selectedText = '';
  noteEditor.content = '';
}

function toggleSelectionMode() {
  const nextMode = !selectionMode.value;
  selectionMode.value = nextMode;
  if (!nextMode) {
    currentSelection.value = null;
    const selection = window.getSelection?.();
    if (selection?.removeAllRanges) selection.removeAllRanges();
    return;
  }
  window.setTimeout(handleReadingSelection, 0);
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

function resolveSelectionActionsPosition(range) {
  const margin = 12;
  const gap = 8;
  const actionWidth = 122;
  const actionHeight = 38;
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  const rect = rects[0] || range.getBoundingClientRect();
  const maxX = Math.max(margin, window.innerWidth - actionWidth - margin);
  const maxY = Math.max(margin, window.innerHeight - actionHeight - margin);
  const preferredX = rect.right + gap;
  const fallbackX = rect.right - actionWidth;
  const preferredY = rect.top - actionHeight - gap;
  const fallbackY = rect.bottom + gap;
  const x = preferredX <= maxX ? preferredX : fallbackX;
  const y = preferredY >= margin ? preferredY : fallbackY;
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY)
  };
}

function inflateRect(rect, size = 0) {
  if (!rect) return null;
  return {
    left: rect.left - size,
    top: rect.top - size,
    right: rect.right + size,
    bottom: rect.bottom + size,
    width: rect.width + size * 2,
    height: rect.height + size * 2
  };
}

function rectsOverlap(a, b) {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function distanceBetweenRects(a, b) {
  if (!a || !b) return 0;
  const dx = Math.max(a.left - b.right, b.left - a.right, 0);
  const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
  return Math.hypot(dx, dy);
}

function rectFromPosition(x, y, width, height) {
  return {
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    width,
    height
  };
}

function getPopoverRect() {
  return document.querySelector('.course-study-popover')?.getBoundingClientRect?.() || null;
}

function getNoteEditorRect() {
  return document.querySelector('.course-note-floating-editor')?.getBoundingClientRect?.() || null;
}

function noteEditorOuterHeight(mode = noteEditor.mode) {
  return mode === 'view'
    ? Math.max(80, noteEditor.height - NOTE_EDITOR_TOOLBAR_HEIGHT)
    : noteEditor.height;
}

function resolveFloatingPosition(anchorRect, width, height, options = {}) {
  const margin = 12;
  const gap = options.gap ?? 8;
  const rect = anchorRect || { left: margin, top: margin, right: margin, bottom: margin, width: 0, height: 0 };
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  const clampX = (value) => Math.min(Math.max(margin, value), maxX);
  const clampY = (value) => Math.min(Math.max(margin, value), maxY);
  const avoidRects = (options.avoidRects || []).filter(Boolean).map((item) => inflateRect(item, gap));
  const candidates = [
    { x: clampX(rect.left), y: rect.bottom + gap },
    { x: clampX(rect.left), y: rect.top - height - gap },
    { x: rect.right + gap, y: clampY(rect.top) },
    { x: rect.left - width - gap, y: clampY(rect.top) },
    { x: clampX(rect.right - width), y: rect.bottom + gap },
    { x: clampX(rect.right - width), y: rect.top - height - gap }
  ]
    .filter((candidate) => (
      candidate.x >= margin
      && candidate.x <= maxX
      && candidate.y >= margin
      && candidate.y <= maxY
    ))
    .map((candidate) => ({
      x: clampX(candidate.x),
      y: clampY(candidate.y)
    }));

  const nonOverlapping = candidates
    .filter((candidate) => {
      const candidateRect = rectFromPosition(candidate.x, candidate.y, width, height);
      return !avoidRects.some((avoidRect) => rectsOverlap(candidateRect, avoidRect));
    })
    .sort((a, b) => {
      const rectA = rectFromPosition(a.x, a.y, width, height);
      const rectB = rectFromPosition(b.x, b.y, width, height);
      return distanceBetweenRects(rectA, rect) - distanceBetweenRects(rectB, rect);
    });

  if (nonOverlapping.length) return nonOverlapping[0];

  return candidates[0] || { x: margin, y: margin };
}

function resolveNoteEditorPosition(anchorRect, width = noteEditor.width, height = noteEditorOuterHeight()) {
  const avoidRects = [anchorRect];
  const popoverRect = getPopoverRect();
  if (popoverRect) avoidRects.push(popoverRect);
  return resolveFloatingPosition(anchorRect, width, height, { gap: 8, avoidRects });
}

function positionNoteEditor(anchorRect) {
  const position = resolveNoteEditorPosition(anchorRect);
  noteEditor.x = position.x;
  noteEditor.y = position.y;
}

function rectFromRange(range) {
  const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  const rect = rects[0] || range.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

function rectFromEventTarget(event) {
  const rect = event?.currentTarget?.getBoundingClientRect?.();
  if (!rect) return null;
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

function beginReadingSelectionDrag(event) {
  if (event.type === 'mousedown' && event.button !== 0) return;
  readingSelectionDragging.value = true;
  activePopover.value = null;
  cancelHidePopover();
}

function finishReadingSelectionDrag() {
  if (!readingSelectionDragging.value) return;
  readingSelectionDragging.value = false;
}

function handleReadingMouseUp() {
  finishReadingSelectionDrag();
  handleReadingSelection();
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

    const selectionRect = rectFromRange(range);
    const position = resolveSelectionActionsPosition(range);
    selectionActionsPosition.x = position.x;
    selectionActionsPosition.y = position.y;
    currentSelection.value = {
      startOffset: start,
      endOffset: end,
      selectedText,
      rect: selectionRect
    };
    activeNoteId.value = null;
  }, 0);
}

function handleNoteSegmentClick(event, segment) {
  const note = firstNoteForSegment(segment);
  if (note) openNoteEditor(note, rectFromEventTarget(event));
}

function handleAnnotatedSegmentClick(event, segment) {
  const note = firstNoteForSegment(segment);
  if (note) {
    openNoteEditor(note, rectFromEventTarget(event));
    return;
  }
  showPopover(event, segment);
}

function handleAnnotatedSegmentHover(event, segment) {
  showPopover(event, segment);
  showNoteForSegment(event, segment);
}

function handleAnnotatedSegmentLeave() {
  scheduleHidePopover();
  scheduleHideNotePreview();
}

function showNoteForSegment(event, segment) {
  if (readingSelectionDragging.value) return;
  const note = firstNoteForSegment(segment);
  if (!note || (noteEditor.open && (noteEditor.mode === 'create' || noteEditor.mode === 'edit'))) return;
  showNotePreview(note, rectFromEventTarget(event));
}

function startNoteForSelection() {
  if (!currentSelection.value) {
    showToast('请先选择课文中的文字', 'error');
    return;
  }

  activePopover.value = null;
  cancelHidePopover();
  activeNoteId.value = null;
  noteEditor.open = true;
  noteEditor.mode = 'create';
  noteEditor.noteId = null;
  noteEditor.startOffset = currentSelection.value.startOffset;
  noteEditor.endOffset = currentSelection.value.endOffset;
  noteEditor.selectedText = currentSelection.value.selectedText;
  noteEditor.content = '';
  positionNoteEditor(currentSelection.value.rect);
}

function showNotePreview(note, anchorRect) {
  cancelHideNotePreview();
  activeNoteId.value = note.id;
  noteEditor.open = true;
  noteEditor.mode = 'view';
  noteEditor.noteId = note.id;
  noteEditor.startOffset = note.start_offset;
  noteEditor.endOffset = note.end_offset;
  noteEditor.selectedText = note.selected_text;
  noteEditor.content = note.note_content;
  positionNoteEditor(anchorRect);
}

function openNoteEditor(note, anchorRect) {
  activePopover.value = null;
  cancelHidePopover();
  activeNoteId.value = note.id;
  noteEditor.open = true;
  noteEditor.mode = 'edit';
  noteEditor.noteId = note.id;
  noteEditor.startOffset = note.start_offset;
  noteEditor.endOffset = note.end_offset;
  noteEditor.selectedText = note.selected_text;
  noteEditor.content = note.note_content;
  positionNoteEditor(anchorRect);
}

function textOffsetWithin(container, node, offset) {
  if (!container || !node) return 0;
  const range = document.createRange();
  range.selectNodeContents(container);
  try {
    range.setEnd(node, offset);
    return range.toString().length;
  } catch (error) {
    return String(container.textContent || '').length;
  } finally {
    range.detach?.();
  }
}

function caretOffsetFromPoint(event) {
  const container = event?.currentTarget;
  const contentLength = String(noteEditor.content || '').length;
  if (!container) return contentLength;

  let node = null;
  let offset = 0;
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(event.clientX, event.clientY);
    node = position?.offsetNode || null;
    offset = position?.offset || 0;
  } else if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    node = range?.startContainer || null;
    offset = range?.startOffset || 0;
  }

  if (!node || !container.contains(node)) return contentLength;
  return Math.min(Math.max(0, textOffsetWithin(container, node, offset)), contentLength);
}

async function focusNoteEditorTextarea(caretOffset = null) {
  await nextTick();
  const textarea = noteEditorTextareaRef.value;
  if (!textarea) return;
  const contentLength = String(noteEditor.content || '').length;
  const offset = caretOffset === null ? contentLength : Math.min(Math.max(0, caretOffset), contentLength);
  textarea.focus();
  textarea.setSelectionRange(offset, offset);
}

function promoteViewedNoteToEdit(event) {
  if (noteEditor.mode !== 'view' || !noteEditor.noteId) return;
  const caretOffset = caretOffsetFromPoint(event);
  const margin = 12;
  noteEditor.y = Math.max(margin, noteEditor.y - NOTE_EDITOR_TOOLBAR_HEIGHT);
  noteEditor.mode = 'edit';
  focusNoteEditorTextarea(caretOffset);
}

function closeNotePreview() {
  if (noteEditor.mode !== 'view') return;
  closeNoteEditor();
}

function scheduleHideNotePreview() {
  if (noteEditor.mode !== 'view') return;
  cancelHideNotePreview();
  hideNotePreviewTimer = window.setTimeout(() => {
    closeNotePreview();
  }, 180);
}

function cancelHideNotePreview() {
  if (!hideNotePreviewTimer) return;
  window.clearTimeout(hideNotePreviewTimer);
  hideNotePreviewTimer = 0;
}

function startNoteEditorDrag(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  noteEditorDragState = {
    offsetX: event.clientX - noteEditor.x,
    offsetY: event.clientY - noteEditor.y
  };
}

function handleNoteEditorDragMove(event) {
  if (!noteEditorDragState) return;
  const margin = 12;
  const maxX = Math.max(margin, window.innerWidth - noteEditor.width - margin);
  const maxY = Math.max(margin, window.innerHeight - noteEditorOuterHeight() - margin);
  noteEditor.x = Math.min(Math.max(margin, event.clientX - noteEditorDragState.offsetX), maxX);
  noteEditor.y = Math.min(Math.max(margin, event.clientY - noteEditorDragState.offsetY), maxY);
}

function stopNoteEditorDrag() {
  noteEditorDragState = null;
}

function handleNoteEditorOutsideMouseDown() {
  if (!noteEditor.open || noteEditor.mode === 'view') return;
  closeNoteEditor();
}

function middleEllipsis(text, maxLength = 20) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(normalized);
  if (chars.length <= maxLength) return normalized;
  const tailLength = Math.min(4, chars.length);
  const headLength = Math.max(1, maxLength - tailLength - 3);
  return `${chars.slice(0, headLength).join('')}...${chars.slice(-tailLength).join('')}`;
}

function questionHistorySelectionLabel(item) {
  const selectedText = item?.context_snapshot?.selected_text || item?.context_snapshot?.selection?.selectedText || '';
  return `「${middleEllipsis(selectedText || '课文选区')}」`;
}

function questionHistoryQuestionLabel(item) {
  const excerpt = String(item?.last_message_excerpt || '').replace(/\s+/g, ' ').trim();
  return excerpt || '暂无对话预览';
}

function openQuestionHistoryConversation(item) {
  if (!item?.id) return;
  activeQuestionConversationId.value = item.id;
  window.dispatchEvent(new CustomEvent('assistant:open-conversation', {
    detail: { id: item.id }
  }));
}

function handleAssistantConversationUpdated(event) {
  const conversation = event?.detail?.conversation;
  if (
    conversation?.context_type === 'text'
    && Number(conversation.context_id) === Number(studyEntry.value?.id)
  ) {
    refreshQuestionHistory();
  }
}

async function focusNote(note) {
  activeNoteId.value = note.id;
  await nextTick();
  const target = readingTextRef.value?.querySelector(`[data-note-ids~="${note.id}"]`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  await nextTick();
  openNoteEditor(note, target?.getBoundingClientRect?.() || null);
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
      noteEditor.noteId = data.item.id;
      noteEditor.content = data.item.note_content;
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
    activeNoteId.value = data.item.id;
    noteEditor.mode = 'edit';
    noteEditor.noteId = data.item.id;
    noteEditor.startOffset = data.item.start_offset;
    noteEditor.endOffset = data.item.end_offset;
    noteEditor.selectedText = data.item.selected_text;
    noteEditor.content = data.item.note_content;
    showToast('笔记已保存', 'success');
  } catch (err) {
    handleApiError(err);
  } finally {
    noteSaving.value = false;
  }
}

async function deleteActiveNote() {
  if (!noteEditor.noteId || noteSaving.value) return;
  if (!window.confirm('确定删除这条笔记吗？')) return;
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

function resolvePopoverPosition(anchorRect, width, height) {
  const avoidRects = [anchorRect];
  const noteRect = getNoteEditorRect();
  if (noteEditor.open && noteRect) avoidRects.push(noteRect);
  return resolveFloatingPosition(anchorRect, width, height, { gap: 12, avoidRects });
}

async function showPopover(event, segment) {
  if (readingSelectionDragging.value) {
    activePopover.value = null;
    cancelHidePopover();
    return;
  }
  cancelHidePopover();
  const width = Math.min(segment.type === 'grammar' ? 390 : 330, window.innerWidth - 32);
  const estimatedHeight = segment.type === 'grammar' ? 290 : 210;
  const anchorRect = rectFromEventTarget(event) || {
    left: event.clientX,
    top: event.clientY,
    right: event.clientX,
    bottom: event.clientY,
    width: 0,
    height: 0
  };
  const initialPosition = resolvePopoverPosition(anchorRect, width, estimatedHeight);
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
  const measuredPosition = resolvePopoverPosition(anchorRect, Math.ceil(rect.width), Math.ceil(rect.height));
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
  window.addEventListener('mouseup', finishReadingSelectionDrag);
  window.addEventListener('touchend', finishReadingSelectionDrag);
  window.addEventListener('mousemove', handleNoteEditorDragMove);
  window.addEventListener('mouseup', stopNoteEditorDrag);
  window.addEventListener('mousedown', handleNoteEditorOutsideMouseDown);
  window.addEventListener('assistant:conversation-updated', handleAssistantConversationUpdated);
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
  cancelHideNotePreview();
  window.removeEventListener('topbar:back', handleTopbarBack);
  window.removeEventListener('mouseup', finishReadingSelectionDrag);
  window.removeEventListener('touchend', finishReadingSelectionDrag);
  window.removeEventListener('mousemove', handleNoteEditorDragMove);
  window.removeEventListener('mouseup', stopNoteEditorDrag);
  window.removeEventListener('mousedown', handleNoteEditorOutsideMouseDown);
  window.removeEventListener('assistant:conversation-updated', handleAssistantConversationUpdated);
  updateTopbarTitle('');
});
</script>
