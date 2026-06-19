<template>
  <section class="card lexicon-page translation-practice-page">
    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
    <div
      v-if="issuePopover.visible"
      class="translation-issue-popover"
      :class="issuePopover.severity === 'serious' ? 'is-serious' : 'is-minor'"
      :style="{ left: `${issuePopover.x}px`, top: `${issuePopover.y}px`, maxHeight: `${issuePopover.maxHeight}px` }"
    >
      <strong>{{ issuePopover.title }}</strong>
      <p>{{ issuePopover.body }}</p>
      <em v-if="issuePopover.suggestion">{{ issuePopover.suggestion }}</em>
    </div>
    <div
      v-if="reviewScoreTooltip.visible"
      class="translation-score-floating-tooltip"
      :style="{
        left: `${reviewScoreTooltip.x}px`,
        top: `${reviewScoreTooltip.y}px`,
        maxHeight: `${reviewScoreTooltip.maxHeight}px`
      }"
    >
      <strong>{{ reviewScoreTooltip.title }}</strong>
      <p>{{ reviewScoreTooltip.comment }}</p>
    </div>
    <div class="translation-practice-shell">
      <div class="translation-practice-grid">
        <main class="translation-practice-main">
          <div v-if="error" class="error-block translation-error-block">
            <p class="error">{{ error }}</p>
            <button class="ghost" type="button" @click="clearError">知道了</button>
          </div>

          <section v-if="!currentPractice" class="translation-empty-state">
            <div class="translation-empty-mark">訳</div>
            <h3>选择范围后生成一次完整练习</h3>
            <div class="translation-practice-controls translation-empty-controls">
              <label class="translation-control-book">
                <span>课本</span>
                <select v-model="selectedTextbookId">
                  <option value="">请选择</option>
                  <option v-for="textbook in textbookOptions" :key="textbook.id" :value="textbook.id">
                    {{ textbook.name }}
                  </option>
                </select>
              </label>
              <div class="translation-control-range translation-slider-control">
                <span>范围</span>
                <div class="translation-segmented-slider" role="group" aria-label="范围">
                  <button
                    v-for="range in rangeOptions"
                    :key="range.rangeKey"
                    type="button"
                    :class="{ active: selectedRangeKey === range.rangeKey }"
                    @click="selectedRangeKey = range.rangeKey"
                  >
                    {{ range.rangeLabel }}
                  </button>
                </div>
              </div>
              <div class="translation-control-type translation-slider-control">
                <span>类型</span>
                <div class="translation-segmented-slider" role="group" aria-label="类型">
                  <button
                    v-for="option in directionOptions"
                    :key="option.value"
                    type="button"
                    :class="{ active: selectedDirection === option.value }"
                    @click="selectedDirection = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
              <div class="translation-control-difficulty translation-slider-control">
                <span>难度</span>
                <div class="translation-segmented-slider" role="group" aria-label="难度">
                  <button
                    v-for="option in difficultyOptions"
                    :key="option.value"
                    type="button"
                    :class="{ active: selectedDifficulty === option.value }"
                    @click="selectedDifficulty = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
            </div>
            <button class="translation-primary-button" type="button" :disabled="generating" @click="generatePractice">
              {{ generating ? '正在生成题目...' : '开始生成' }}
            </button>
          </section>

          <template v-else>
            <section class="translation-exercise-panel">
              <article v-for="item in exerciseItems" :key="item.id" class="translation-question-card">
                <div class="translation-question-header">
                  <h4>{{ currentPracticeTitle }}</h4>
                  <button
                    class="ghost translation-question-back-button"
                    type="button"
                    :disabled="generating || submitting || saving"
                    @click="returnToPracticeHome"
                  >
                    返回
                  </button>
                </div>
                <div class="translation-exercise-meta">
                  <div class="translation-meta-row">
                    <strong>本次目标语法</strong>
                    <span
                      v-for="grammar in targetGrammarForItem(item)"
                      :key="`${item.id}-${grammar.id || grammar.grammar}`"
                      class="translation-grammar-chip"
                    >
                      {{ grammar.grammar }}
                    </span>
                    <span v-if="!targetGrammarForItem(item).length" class="translation-meta-empty">-</span>
                  </div>
                  <div class="translation-meta-row translation-advanced-row">
                    <strong>注释</strong>
                    <template v-if="advancedNotes.length">
                      <span v-for="(note, index) in advancedNotes" :key="index">
                        {{ formatAdvancedNote(note) }}
                      </span>
                    </template>
                    <span v-else class="translation-meta-empty">无</span>
                  </div>
                </div>
                <p class="translation-prompt-text">{{ item.prompt_text }}</p>
                <div class="translation-answer-box">
                  <textarea
                    v-if="currentPractice.status !== 'reviewed'"
                    v-model="answers[item.id]"
                    :disabled="submitting || saving"
                    rows="5"
                    placeholder="在这里输入你的译文"
                  ></textarea>
                  <div v-else class="translation-reviewed-answer">
                    <template
                      v-for="(segment, index) in answerSegmentsForItem(item)"
                      :key="`${item.id}-answer-${index}`"
                    >
                      <span
                        v-if="segment.issue"
                        class="translation-answer-issue"
                        :class="segment.issue.severity === 'serious' ? 'is-serious' : 'is-minor'"
                        :data-tooltip="issueTooltip(segment.issue)"
                        @mouseenter="showIssuePopover($event, segment.issue)"
                        @mouseover="showIssuePopover($event, segment.issue)"
                        @mousemove="showIssuePopover($event, segment.issue)"
                        @mouseleave="hideIssuePopover"
                      >{{ segment.text }}</span>
                      <span v-else>{{ segment.text }}</span>
                    </template>
                  </div>
                  <div v-if="currentPractice.status !== 'reviewed'" class="translation-answer-actions">
                    <button
                      class="ghost"
                      type="button"
                      :disabled="submitting || saving"
                      @click="savePracticeAnswers"
                    >
                      {{ saving ? '保存中...' : '保存' }}
                    </button>
                    <button
                      class="translation-primary-button"
                      type="button"
                      :disabled="submitting || saving"
                      @click="submitPractice"
                    >
                      {{ submitting ? '批改中...' : '提交' }}
                    </button>
                  </div>
                </div>
              </article>

            </section>
          </template>
        </main>

        <aside class="translation-practice-side">
          <section v-if="!currentPractice" class="translation-history-panel translation-combined-panel">
            <div class="translation-side-header">
              <h3>练习记录</h3>
              <button class="ghost" type="button" :disabled="historyLoading" @click="loadHistory">刷新</button>
            </div>
            <div v-if="historyLoading" class="translation-side-empty">加载中...</div>
            <div v-else-if="historyRows.length" class="translation-history-list">
              <div
                v-for="item in historyRows"
                :key="item.id"
                class="translation-history-item"
                :class="{ active: currentPractice?.id === item.id }"
              >
                <button
                  class="translation-history-open"
                  type="button"
                  @click="openPractice(item.id)"
                >
                  <strong>{{ item.exercise?.title || '文学翻译练习' }}</strong>
                  <span>{{ historyMetaLabel(item) }}</span>
                </button>
                <button
                  class="translation-history-delete"
                  type="button"
                  :disabled="deletingPracticeId === item.id"
                  @click="deletePractice(item)"
                >
                  {{ deletingPracticeId === item.id ? '删除中' : '删除' }}
                </button>
              </div>
            </div>
            <div v-else class="translation-side-empty">暂无记录</div>
          </section>

          <section v-else class="translation-work-panel translation-combined-panel">
            <div class="translation-side-header">
              <div class="translation-work-title-group">
                <h3>提问、批改与追问</h3>
                <span class="translation-status-pill" :class="`is-${currentPractice.status}`">
                  {{ currentPractice.status === 'reviewed' ? '已批改' : '答题中' }}
                </span>
              </div>
              <span>当前练习上下文</span>
            </div>
            <div class="translation-work-body">
              <div class="translation-chat-body">
                <div v-if="displayMessages.length" ref="chatMessagesEl" class="translation-chat-messages">
                  <article
                    v-for="message in displayMessages"
                    :key="message.id"
                    :class="[
                      message.role === 'assistant' ? 'is-assistant' : 'is-user',
                      message.type === 'review' ? 'is-review' : ''
                    ]"
                  >
                    <p v-if="message.phase === 'thinking'" class="translation-thinking-text">
                      {{ message.content || '思考中...' }}
                    </p>
                    <template v-else-if="message.type === 'review'">
                      <div class="translation-review-score-strip">
                        <div
                          v-for="scoreItem in reviewScoreItems"
                          :key="scoreItem.key"
                          class="translation-review-score-item"
                          @mouseenter="showReviewScoreTooltip($event, scoreItem)"
                          @mousemove="showReviewScoreTooltip($event, scoreItem)"
                          @mouseleave="hideReviewScoreTooltip"
                        >
                          <div
                            class="translation-review-score-circle"
                            :style="{ '--score-deg': scoreItem.deg }"
                          >
                            <span>{{ scoreItem.score }}</span>
                          </div>
                          <strong>{{ scoreItem.label }}</strong>
                        </div>
                      </div>
                      <p class="translation-review-score-hint">鼠标悬停以查看详细分析。</p>
                      <div
                        v-if="message.content"
                        class="translation-review-markdown translation-message-markdown"
                        v-html="markdownHtml(message.content)"
                      ></div>
                    </template>
                    <div
                      v-else
                      class="translation-message-markdown"
                      v-html="markdownHtml(message.content)"
                    ></div>
                  </article>
                </div>
              </div>
            </div>
            <div v-if="(!currentPractice.review && !submitting) || !displayMessages.length" class="translation-work-hints">
              <p v-if="!currentPractice.review && !submitting">提交后会在这里显示批改结果。</p>
              <p v-if="!displayMessages.length">作答前后，均可在此处进行提问或追问。</p>
            </div>
            <form class="translation-chat-form" @submit.prevent="askPractice">
              <textarea
                v-model.trim="chatInput"
                :disabled="asking"
                maxlength="1000"
                rows="3"
                placeholder="针对本次题目或批改结果继续提问"
              ></textarea>
              <button
                class="translation-primary-button"
                type="submit"
                :disabled="asking || !chatInput"
              >
                {{ asking ? '发送中...' : '发送' }}
              </button>
            </form>
          </section>
        </aside>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import { apiRequest } from '../utils/apiClient';

const START_SELECTION_CACHE_KEY = 'translation-practice:start-selection:v1';
defineOptions({ name: 'TranslationPractice' });

const reviewMarkdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

const ranges = ref([]);
const selectedTextbookId = ref('');
const selectedRangeKey = ref('upper');
const selectedDirection = ref('jp_to_zh');
const selectedDifficulty = ref('normal');
const currentPractice = ref(null);
const historyRows = ref([]);
const generating = ref(false);
const submitting = ref(false);
const saving = ref(false);
const historyLoading = ref(false);
const asking = ref(false);
const deletingPracticeId = ref(null);
const translationPageActive = ref(true);
const error = ref('');
const toast = reactive({ visible: false, message: '', type: 'info' });
const issuePopover = reactive({
  visible: false,
  x: 0,
  y: 0,
  maxHeight: 180,
  severity: 'minor',
  title: '',
  body: '',
  suggestion: ''
});
const reviewScoreTooltip = reactive({
  visible: false,
  x: 0,
  y: 0,
  maxHeight: 220,
  title: '',
  comment: ''
});
const answers = reactive({});
const chatInput = ref('');
const chatMessagesEl = ref(null);
let toastTimer = null;

const directionOptions = [
  { value: 'jp_to_zh', label: '日译汉' },
  { value: 'zh_to_jp', label: '汉译日' }
];

const difficultyOptions = [
  { value: 'normal', label: '普通' },
  { value: 'hard', label: '困难' }
];

const textbookOptions = computed(() => {
  const map = new Map();
  ranges.value.forEach((range) => {
    map.set(Number(range.textbookId), { id: Number(range.textbookId), name: range.textbookName });
  });
  return Array.from(map.values());
});

const visibleRanges = computed(() => {
  const textbookId = Number(selectedTextbookId.value || 0);
  return ranges.value.filter((range) => Number(range.textbookId) === textbookId);
});

const rangeOptions = computed(() => {
  const source = visibleRanges.value.length ? visibleRanges.value : ranges.value;
  const map = new Map();
  source.forEach((range) => {
    map.set(range.rangeKey, {
      rangeKey: range.rangeKey,
      rangeLabel: range.rangeLabel
    });
  });
  return Array.from(map.values()).sort((left, right) => {
    if (left.rangeKey === right.rangeKey) return 0;
    return left.rangeKey === 'upper' ? -1 : 1;
  });
});

const currentPracticeHeaderLabel = computed(() => {
  const practice = currentPractice.value;
  if (!practice) return '翻译练习';
  const direction = directionLabel(practice.exercise?.items?.[0]?.direction || selectedDirection.value);
  return `${direction} / ${practice.textbook_name || '综合日语 第四册'} / ${practice.range_label || ''}`;
});
const currentPracticeTitle = computed(() => currentPractice.value?.exercise?.title || '翻译练习');
const exerciseItems = computed(() => currentPractice.value?.exercise?.items || []);
const advancedNotes = computed(() => {
  const notes = currentPractice.value?.exercise?.advanced_notes;
  return Array.isArray(notes) ? notes : [];
});
const reviewIssues = computed(() => currentPractice.value?.review?.issues || []);
const practiceMessages = computed(() => currentPractice.value?.messages || []);
const reviewMarkdownSource = computed(() => {
  const review = currentPractice.value?.review;
  if (!review) return '';
  const lines = [];

  const grammarFocus = Array.isArray(review.grammar_focus) ? review.grammar_focus : [];
  if (grammarFocus.length) {
    lines.push('#### 目标文法处理');
    grammarFocus.forEach((item) => {
      const status = item?.ok === false ? '需注意' : '处理较好';
      if (item?.grammar || item?.comment) {
        lines.push(`- **${item?.grammar || '-'}**：${status}。${item?.comment || ''}`.trim());
      }
    });
  }

  const corrected = Array.isArray(review.corrected_answers) ? review.corrected_answers : [];
  if (corrected.length) {
    lines.push('#### 参考译文');
    corrected.forEach((answer) => {
      const revised = answer?.revised_answer || answer?.reference_answer;
      if (revised) {
        lines.push(`**${revised}**${answer?.comment ? `\n\n> ${answer.comment}` : ''}`);
      }
    });
  }

  const nextSteps = Array.isArray(review.next_steps) ? review.next_steps.filter(Boolean) : [];
  if (nextSteps.length) {
    lines.push('#### 下一步学习建议');
    nextSteps.forEach((step) => {
      lines.push(`- ${step}`);
    });
  }

  return lines.join('\n\n');
});
const reviewScoreItems = computed(() => {
  const review = currentPractice.value?.review;
  if (!review) return [];
  const items = [];
  if (Number.isFinite(Number(review.score))) {
    items.push({
      key: 'overall',
      label: '综合',
      score: clampScore(review.score),
      comment: review.summary || ''
    });
  }
  (Array.isArray(review.dimensions) ? review.dimensions : []).slice(0, 4).forEach((dimension, index) => {
    if (!Number.isFinite(Number(dimension?.score))) return;
    items.push({
      key: `dimension-${index}`,
      label: dimension?.label || '评价',
      score: clampScore(dimension.score),
      comment: dimension?.comment || ''
    });
  });
  return items.map((item) => ({
    ...item,
    deg: `${Math.max(0, Math.min(1, Number(item.score || 0) / 100)) * 360}deg`
  }));
});
const displayMessages = computed(() => {
  const messages = practiceMessages.value.map((message) => ({
    ...message,
    type: 'chat'
  }));

  if (currentPractice.value?.review) {
    const reviewTime = timestampValue(currentPractice.value.updated_at);
    const reviewRequestMessage = {
      id: `review-request-${currentPractice.value.id}`,
      type: 'chat',
      role: 'user',
      created_at: currentPractice.value.updated_at,
      content: '请对我的译文进行批改。'
    };
    const reviewMessage = {
      id: `review-${currentPractice.value.id}`,
      type: 'review',
      role: 'assistant',
      created_at: currentPractice.value.updated_at,
      content: reviewMarkdownSource.value
    };
    const insertAt = messages.findIndex((message) => timestampValue(message.created_at, Number.POSITIVE_INFINITY) > reviewTime);
    if (insertAt >= 0) {
      messages.splice(insertAt, 0, reviewRequestMessage, reviewMessage);
    } else {
      messages.push(reviewRequestMessage, reviewMessage);
    }
  }

  if (submitting.value) {
    messages.push({
      id: 'local-review-request',
      type: 'chat',
      role: 'user',
      content: '请对我的译文进行批改。'
    });
    messages.push({
      id: 'local-review-thinking',
      type: 'chat',
      role: 'assistant',
      phase: 'thinking',
      content: '正在批改中...'
    });
  }

  return messages;
});

function markdownHtml(value) {
  return reviewMarkdownRenderer.render(String(value || ''));
}

function clampScore(value) {
  const score = Math.round(Number(value || 0));
  return Math.max(0, Math.min(100, score));
}

function timestampValue(value, fallback = 0) {
  const timestamp = new Date(String(value || '').replace(' ', 'T')).getTime();
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function answerSegmentsForItem(item) {
  const answerText = String(answers[item?.id] || '');
  if (!answerText) return [{ text: '', issue: null }];
  const issues = (currentPractice.value?.review?.issues || [])
    .filter((issue) => {
      const issueItemId = String(issue?.item_id || '');
      return (!issueItemId || issueItemId === item?.id) && String(issue?.quote || '').trim();
    })
    .map((issue) => ({
      ...issue,
      quote: String(issue.quote || '').trim()
    }));
  if (!issues.length) return [{ text: answerText, issue: null }];

  const ranges = [];
  issues.forEach((issue) => {
    const start = answerText.indexOf(issue.quote);
    if (start < 0) return;
    const end = start + issue.quote.length;
    if (ranges.some((range) => start < range.end && end > range.start)) return;
    ranges.push({ start, end, issue });
  });
  ranges.sort((left, right) => left.start - right.start);
  if (!ranges.length) return [{ text: answerText, issue: null }];

  const segments = [];
  let cursor = 0;
  ranges.forEach((range) => {
    if (range.start > cursor) {
      segments.push({ text: answerText.slice(cursor, range.start), issue: null });
    }
    segments.push({ text: answerText.slice(range.start, range.end), issue: range.issue });
    cursor = range.end;
  });
  if (cursor < answerText.length) {
    segments.push({ text: answerText.slice(cursor), issue: null });
  }
  return segments;
}

function issueTooltip(issue) {
  const severity = issueSeverityLabel(issue?.severity);
  const category = formatIssueCategory(issue?.category);
  return [
    `${severity}${category ? ` / ${category}` : ''}`,
    issue?.explanation,
    issue?.suggestion ? `建议：${issue.suggestion}` : ''
  ].filter(Boolean).join('\n');
}

function issueSeverityLabel(severity) {
  return severity === 'serious' ? '需修正' : '可优化';
}

function formatIssueCategory(category) {
  return String(category || '')
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' / ');
}

function showIssuePopover(event, issue) {
  const rect = event.currentTarget.getBoundingClientRect();
  const width = 280;
  const margin = 12;
  const x = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
  const y = Math.min(rect.bottom + 8, window.innerHeight - 72);
  const maxHeight = Math.max(72, window.innerHeight - y - margin);
  issuePopover.visible = true;
  issuePopover.x = x;
  issuePopover.y = y;
  issuePopover.maxHeight = maxHeight;
  issuePopover.severity = issue?.severity === 'serious' ? 'serious' : 'minor';
  const category = formatIssueCategory(issue?.category);
  issuePopover.title = `${issueSeverityLabel(issuePopover.severity)}${category ? ` / ${category}` : ''}`;
  issuePopover.body = String(issue?.explanation || '').trim();
  issuePopover.suggestion = issue?.suggestion ? `建议：${issue.suggestion}` : '';
}

function hideIssuePopover() {
  issuePopover.visible = false;
}

function showReviewScoreTooltip(event, scoreItem) {
  const comment = String(scoreItem?.comment || '').trim();
  if (!comment) {
    hideReviewScoreTooltip();
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const width = 260;
  const margin = 12;
  const preferredX = rect.left + rect.width / 2 - width / 2;
  const maxX = window.innerWidth - width - margin;
  const x = Math.min(Math.max(preferredX, margin), Math.max(margin, maxX));
  const y = Math.min(rect.bottom + 8, window.innerHeight - 76);
  reviewScoreTooltip.visible = true;
  reviewScoreTooltip.x = x;
  reviewScoreTooltip.y = y;
  reviewScoreTooltip.maxHeight = Math.max(72, window.innerHeight - y - margin);
  reviewScoreTooltip.title = `${scoreItem.label}：${scoreItem.score}`;
  reviewScoreTooltip.comment = comment;
}

function hideReviewScoreTooltip() {
  reviewScoreTooltip.visible = false;
}

function readStartSelectionCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(START_SELECTION_CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writeStartSelectionCache() {
  try {
    localStorage.setItem(START_SELECTION_CACHE_KEY, JSON.stringify({
      textbookId: selectedTextbookId.value || '',
      rangeKey: selectedRangeKey.value || 'upper',
      direction: selectedDirection.value || 'jp_to_zh',
      difficulty: selectedDifficulty.value || 'normal'
    }));
  } catch (err) {
    // localStorage may be unavailable in private or restricted browser contexts.
  }
}

function restoreStartSelectionCache() {
  const cached = readStartSelectionCache();
  const cachedTextbookId = Number(cached.textbookId || 0);
  const hasCachedTextbook = textbookOptions.value.some((textbook) => Number(textbook.id) === cachedTextbookId);
  if (hasCachedTextbook) {
    selectedTextbookId.value = cachedTextbookId;
  }

  const availableRanges = hasCachedTextbook
    ? ranges.value.filter((range) => Number(range.textbookId) === cachedTextbookId)
    : ranges.value;
  if (availableRanges.some((range) => range.rangeKey === cached.rangeKey)) {
    selectedRangeKey.value = cached.rangeKey;
  }

  if (directionOptions.some((option) => option.value === cached.direction)) {
    selectedDirection.value = cached.direction;
  }
  if (difficultyOptions.some((option) => option.value === cached.difficulty)) {
    selectedDifficulty.value = cached.difficulty;
  }
}

function clearError() {
  error.value = '';
}

function showToast(message, type = 'info') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.visible = false;
    toastTimer = null;
  }, 1600);
}

function directionLabel(direction) {
  return direction === 'zh_to_jp' ? '汉译日' : '日译汉';
}

function shortTextbookName(name) {
  const text = String(name || '');
  const match = text.match(/第[一二三四五六七八九十\d]+册/);
  return match ? match[0] : (text || '第四册');
}

function historyMetaLabel(item) {
  const direction = directionLabel(item?.exercise?.items?.[0]?.direction || selectedDirection.value);
  const status = item?.status === 'reviewed' ? '已批改' : '未提交';
  return `${shortTextbookName(item?.textbook_name)}/${direction}/${item?.range_label || '-'} ${status}`;
}

function targetGrammarForItem(item) {
  const direct = Array.isArray(item?.target_grammar) ? item.target_grammar : [];
  if (direct.length) return direct;
  const ids = new Set((item?.target_grammar_ids || []).map((id) => Number(id)));
  return (currentPractice.value?.grammar || [])
    .filter((grammar) => ids.has(Number(grammar.id)))
    .map((grammar) => ({
      id: grammar.id,
      grammar: grammar.grammar,
      formation: grammar.formation
    }));
}

function formatAdvancedNote(note) {
  if (typeof note === 'string') return note;
  if (!note || typeof note !== 'object') return String(note || '');
  const word = note.word || note.expression || note.term || note.label || note.reading || note.kana;
  const meaning = note.meaning || note.translation || note.explanation || note.definition;
  return [word, meaning].filter(Boolean).join('：');
}

function setCurrentPractice(item) {
  currentPractice.value = item;
  Object.keys(answers).forEach((key) => delete answers[key]);
  const savedAnswers = item?.answer || {};
  (item?.exercise?.items || []).forEach((exerciseItem) => {
    answers[exerciseItem.id] = savedAnswers[exerciseItem.id] || '';
  });
}

function scrollChatToBottom() {
  nextTick(() => {
    const el = chatMessagesEl.value;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  });
}

function returnToPracticeHome() {
  currentPractice.value = null;
  chatInput.value = '';
  Object.keys(answers).forEach((key) => delete answers[key]);
  updateTranslationTopbar();
}

function updateTranslationTopbar() {
  if (!translationPageActive.value) return;
  window.dispatchEvent(new CustomEvent('topbar:title-override', {
    detail: currentPractice.value
      ? { title: currentPracticeHeaderLabel.value, backLabel: '' }
      : { title: '', backLabel: '' }
  }));
}

async function loadOptions() {
  const data = await apiRequest('/api/user/translation-practice/options');
  ranges.value = data.ranges || [];
  restoreStartSelectionCache();
}

async function loadHistory() {
  historyLoading.value = true;
  try {
    const data = await apiRequest('/api/user/translation-practices', {
      params: { limit: 20 },
      timeout: 30000
    });
    historyRows.value = data.rows || [];
  } catch (err) {
    error.value = err.message || '加载练习记录失败';
  } finally {
    historyLoading.value = false;
  }
}

async function openPractice(id) {
  if (!id) return;
  try {
    const data = await apiRequest(`/api/user/translation-practices/${id}`, { timeout: 30000 });
    setCurrentPractice(data.item);
  } catch (err) {
    error.value = err.message || '打开练习记录失败';
  }
}

async function deletePractice(item) {
  if (!item?.id || deletingPracticeId.value) return;
  const title = item.exercise?.title || '这条练习记录';
  if (!window.confirm(`确定删除「${title}」吗？删除后无法恢复。`)) return;
  deletingPracticeId.value = item.id;
  error.value = '';
  try {
    await apiRequest(`/api/user/translation-practices/${item.id}`, {
      method: 'DELETE',
      timeout: 30000
    });
    if (currentPractice.value?.id === item.id) {
      returnToPracticeHome();
    }
    await loadHistory();
  } catch (err) {
    error.value = err.message || '删除练习记录失败';
  } finally {
    deletingPracticeId.value = null;
  }
}

async function generatePractice() {
  if (!selectedTextbookId.value) {
    error.value = '';
    showToast('请先选择课本', 'error');
    return;
  }
  generating.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/api/user/translation-practices/generate', {
      method: 'POST',
      body: {
        textbook_id: selectedTextbookId.value,
        range_key: selectedRangeKey.value,
        direction_mode: selectedDirection.value,
        difficulty_mode: selectedDifficulty.value
      },
      timeout: 120000
    });
    setCurrentPractice(data.item);
    await loadHistory();
  } catch (err) {
    error.value = err.message || '生成翻译练习失败';
  } finally {
    generating.value = false;
  }
}

async function submitPractice() {
  if (!currentPractice.value?.id) return;
  submitting.value = true;
  saving.value = true;
  error.value = '';
  scrollChatToBottom();
  try {
    await persistPracticeAnswers({ refreshHistory: false, ignoreSavingGuard: true });
    saving.value = false;
    const data = await apiRequest(`/api/user/translation-practices/${currentPractice.value.id}/submit`, {
      method: 'POST',
      body: { answers: { ...answers } },
      timeout: 120000
    });
    setCurrentPractice(data.item);
    await loadHistory();
    scrollChatToBottom();
  } catch (err) {
    error.value = err.message || '批改翻译练习失败';
  } finally {
    submitting.value = false;
    saving.value = false;
  }
}

async function persistPracticeAnswers({ refreshHistory = true, ignoreSavingGuard = false } = {}) {
  if (!currentPractice.value?.id || (saving.value && !ignoreSavingGuard)) return;
  const data = await apiRequest(`/api/user/translation-practices/${currentPractice.value.id}/answers`, {
    method: 'PATCH',
    body: { answers: { ...answers } },
    timeout: 30000
  });
  setCurrentPractice(data.item);
  if (refreshHistory) {
    await loadHistory();
  }
  return data.item;
}

async function savePracticeAnswers() {
  if (!currentPractice.value?.id || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await persistPracticeAnswers();
  } catch (err) {
    error.value = err.message || '保存翻译答案失败';
  } finally {
    saving.value = false;
  }
}

async function askPractice() {
  if (!currentPractice.value?.id || !chatInput.value || asking.value) return;
  const content = chatInput.value;
  const previousMessages = [...practiceMessages.value];
  const time = Date.now();
  const optimisticMessages = [
    ...previousMessages,
    {
      id: `local-user-${time}`,
      role: 'user',
      content
    },
    {
      id: `local-assistant-${time}`,
      role: 'assistant',
      content: '',
      phase: 'thinking'
    }
  ];
  asking.value = true;
  error.value = '';
  chatInput.value = '';
  currentPractice.value = {
    ...currentPractice.value,
    messages: optimisticMessages
  };
  scrollChatToBottom();
  try {
    const data = await apiRequest(`/api/user/translation-practices/${currentPractice.value.id}/messages`, {
      method: 'POST',
      body: { content },
      timeout: 90000
    });
    currentPractice.value = {
      ...currentPractice.value,
      messages: data.messages || []
    };
    scrollChatToBottom();
  } catch (err) {
    chatInput.value = content;
    currentPractice.value = {
      ...currentPractice.value,
      messages: previousMessages
    };
    error.value = err.message || '追问失败';
  } finally {
    asking.value = false;
  }
}

onMounted(async () => {
  try {
    await loadOptions();
    await loadHistory();
    updateTranslationTopbar();
  } catch (err) {
    error.value = err.message || '初始化翻译练习失败';
  }
});

onActivated(() => {
  translationPageActive.value = true;
  updateTranslationTopbar();
});

onDeactivated(() => {
  translationPageActive.value = false;
  window.dispatchEvent(new CustomEvent('topbar:title-override', {
    detail: { title: '', backLabel: '' }
  }));
});

onBeforeUnmount(() => {
  translationPageActive.value = false;
  window.dispatchEvent(new CustomEvent('topbar:title-override', {
    detail: { title: '', backLabel: '' }
  }));
});

watch(currentPracticeHeaderLabel, () => {
  updateTranslationTopbar();
});

watch(
  [selectedTextbookId, selectedRangeKey, selectedDirection, selectedDifficulty],
  writeStartSelectionCache
);
</script>
