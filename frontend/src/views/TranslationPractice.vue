<template>
  <section class="card lexicon-page translation-practice-page">
    <div class="translation-practice-shell">
      <header class="translation-practice-header">
        <div class="translation-practice-title">
          <h2>{{ currentPractice ? `翻译练习：${currentPracticeHeaderLabel}` : '翻译练习' }}</h2>
        </div>
        <button
          v-if="currentPractice"
          class="ghost translation-header-back-button"
          type="button"
          :disabled="generating || submitting || saving"
          @click="returnToPracticeHome"
        >
          返回
        </button>
      </header>

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
                <select v-model.number="selectedTextbookId">
                  <option v-for="textbook in textbookOptions" :key="textbook.id" :value="textbook.id">
                    {{ textbook.name }}
                  </option>
                </select>
              </label>
              <label class="translation-control-range">
                <span>范围</span>
                <select v-model="selectedRangeKey">
                  <option v-for="range in visibleRanges" :key="range.rangeKey" :value="range.rangeKey">
                    {{ range.rangeLabel }}
                  </option>
                </select>
              </label>
              <label class="translation-control-type">
                <span>类型</span>
                <select v-model="selectedDirection">
                  <option v-for="option in directionOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>
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
                  <span class="translation-status-pill" :class="`is-${currentPractice.status}`">
                    {{ currentPractice.status === 'reviewed' ? '已批改' : '答题中' }}
                  </span>
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
                    <strong>超范围提示</strong>
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
                    v-model="answers[item.id]"
                    :disabled="currentPractice.status === 'reviewed' || submitting || saving"
                    rows="5"
                    placeholder="在这里输入你的译文"
                  ></textarea>
                  <div class="translation-answer-actions">
                    <button
                      class="ghost"
                      type="button"
                      :disabled="currentPractice.status === 'reviewed' || submitting || saving"
                      @click="savePracticeAnswers"
                    >
                      {{ saving ? '保存中...' : '保存' }}
                    </button>
                    <button
                      class="translation-primary-button"
                      type="button"
                      :disabled="currentPractice.status === 'reviewed' || submitting || saving"
                      @click="submitPractice"
                    >
                      {{ submitting ? '提交中...' : '提交' }}
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
              <button
                v-for="item in historyRows"
                :key="item.id"
                type="button"
                :class="{ active: currentPractice?.id === item.id }"
                @click="openPractice(item.id)"
              >
                <strong>{{ item.exercise?.title || '文学翻译练习' }}</strong>
                <span>{{ item.range_label }} / {{ item.status === 'reviewed' ? `${item.review?.score ?? '-'}分` : '未批改' }}</span>
              </button>
            </div>
            <div v-else class="translation-side-empty">暂无记录</div>
          </section>

          <section v-else class="translation-work-panel translation-combined-panel">
            <div class="translation-side-header">
              <h3>批改与追问</h3>
              <span>当前练习上下文</span>
            </div>
            <div class="translation-work-body">
              <div v-if="currentPractice.review" class="translation-side-review">
                <div class="translation-score-block">
                  <div>
                    <span>综合评分</span>
                    <strong>{{ currentPractice.review.score }}</strong>
                  </div>
                  <p>{{ currentPractice.review.summary }}</p>
                </div>

                <div class="translation-dimension-grid">
                  <article v-for="dimension in currentPractice.review.dimensions" :key="dimension.label">
                    <span>{{ dimension.label }}</span>
                    <strong>{{ dimension.score }}</strong>
                    <p>{{ dimension.comment }}</p>
                  </article>
                </div>

                <div class="translation-issue-list">
                  <h3>问题标注</h3>
                  <div v-if="reviewIssues.length" class="translation-issues">
                    <article
                      v-for="(issue, index) in reviewIssues"
                      :key="`${issue.item_id}-${issue.quote}-${index}`"
                      :class="issue.severity === 'serious' ? 'is-serious' : 'is-minor'"
                    >
                      <div>
                        <strong>{{ issue.severity === 'serious' ? '严重问题' : '小问题' }}</strong>
                        <span>{{ issue.category }}</span>
                      </div>
                      <p v-if="issue.quote" class="translation-issue-quote">{{ issue.quote }}</p>
                      <p>{{ issue.explanation }}</p>
                      <em>{{ issue.suggestion }}</em>
                    </article>
                  </div>
                  <p v-else class="muted">本次没有明显问题。</p>
                </div>

                <div class="translation-corrections">
                  <h3>参考与建议</h3>
                  <article v-for="answer in currentPractice.review.corrected_answers" :key="answer.item_id">
                    <span>{{ answer.item_id === 'jp_zh' ? '日译汉' : '汉译日' }}</span>
                    <p>{{ answer.revised_answer || answer.reference_answer }}</p>
                    <small>{{ answer.comment }}</small>
                  </article>
                </div>
              </div>

              <div class="translation-chat-body">
                <div v-if="practiceMessages.length" class="translation-chat-messages">
                  <article
                    v-for="message in practiceMessages"
                    :key="message.id"
                    :class="message.role === 'assistant' ? 'is-assistant' : 'is-user'"
                  >
                    <p>{{ message.content }}</p>
                  </article>
                </div>
              </div>
            </div>
            <div v-if="!currentPractice.review || !practiceMessages.length" class="translation-work-hints">
              <p v-if="!currentPractice.review">提交后会在这里显示批改结果。</p>
              <p v-if="!practiceMessages.length">完成或查看练习后，可以在这里继续追问。</p>
            </div>
            <form class="translation-chat-form" @submit.prevent="askPractice">
              <textarea
                v-model.trim="chatInput"
                :disabled="asking"
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
import { computed, onMounted, reactive, ref } from 'vue';
import { apiRequest } from '../utils/apiClient';

const ranges = ref([]);
const selectedTextbookId = ref(0);
const selectedRangeKey = ref('upper');
const selectedDirection = ref('jp_to_zh');
const currentPractice = ref(null);
const historyRows = ref([]);
const generating = ref(false);
const submitting = ref(false);
const saving = ref(false);
const historyLoading = ref(false);
const asking = ref(false);
const error = ref('');
const answers = reactive({});
const chatInput = ref('');

const directionOptions = [
  { value: 'jp_to_zh', label: '日译汉' },
  { value: 'zh_to_jp', label: '汉译日' }
];

const textbookOptions = computed(() => {
  const map = new Map();
  ranges.value.forEach((range) => {
    map.set(Number(range.textbookId), { id: Number(range.textbookId), name: range.textbookName });
  });
  return Array.from(map.values());
});

const visibleRanges = computed(() => {
  const textbookId = Number(selectedTextbookId.value || textbookOptions.value[0]?.id || 0);
  return ranges.value.filter((range) => Number(range.textbookId) === textbookId);
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

function clearError() {
  error.value = '';
}

function directionLabel(direction) {
  return direction === 'zh_to_jp' ? '汉译日' : '日译汉';
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
  return [
    note.word || note.expression || note.term || note.label,
    note.reading || note.kana,
    note.meaning || note.translation || note.explanation,
    note.reason
  ].filter(Boolean).join('：');
}

function setCurrentPractice(item) {
  currentPractice.value = item;
  Object.keys(answers).forEach((key) => delete answers[key]);
  const savedAnswers = item?.answer || {};
  (item?.exercise?.items || []).forEach((exerciseItem) => {
    answers[exerciseItem.id] = savedAnswers[exerciseItem.id] || '';
  });
}

function returnToPracticeHome() {
  currentPractice.value = null;
  chatInput.value = '';
  Object.keys(answers).forEach((key) => delete answers[key]);
}

async function loadOptions() {
  const data = await apiRequest('/api/user/translation-practice/options');
  ranges.value = data.ranges || [];
  if (textbookOptions.value.length && !selectedTextbookId.value) {
    selectedTextbookId.value = textbookOptions.value[0].id;
  }
  if (visibleRanges.value.length && !visibleRanges.value.some((item) => item.rangeKey === selectedRangeKey.value)) {
    selectedRangeKey.value = visibleRanges.value[0].rangeKey;
  }
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

async function generatePractice() {
  generating.value = true;
  error.value = '';
  try {
    const data = await apiRequest('/api/user/translation-practices/generate', {
      method: 'POST',
      body: {
        textbook_id: selectedTextbookId.value,
        range_key: selectedRangeKey.value,
        direction_mode: selectedDirection.value
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
  error.value = '';
  try {
    const data = await apiRequest(`/api/user/translation-practices/${currentPractice.value.id}/submit`, {
      method: 'POST',
      body: { answers: { ...answers } },
      timeout: 120000
    });
    setCurrentPractice(data.item);
    await loadHistory();
  } catch (err) {
    error.value = err.message || '批改翻译练习失败';
  } finally {
    submitting.value = false;
  }
}

async function savePracticeAnswers() {
  if (!currentPractice.value?.id || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    const data = await apiRequest(`/api/user/translation-practices/${currentPractice.value.id}/answers`, {
      method: 'PATCH',
      body: { answers: { ...answers } },
      timeout: 30000
    });
    setCurrentPractice(data.item);
    await loadHistory();
  } catch (err) {
    error.value = err.message || '保存翻译答案失败';
  } finally {
    saving.value = false;
  }
}

async function askPractice() {
  if (!currentPractice.value?.id || !chatInput.value || asking.value) return;
  const content = chatInput.value;
  asking.value = true;
  error.value = '';
  chatInput.value = '';
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
  } catch (err) {
    chatInput.value = content;
    error.value = err.message || '追问失败';
  } finally {
    asking.value = false;
  }
}

onMounted(async () => {
  try {
    await loadOptions();
    await loadHistory();
  } catch (err) {
    error.value = err.message || '初始化翻译练习失败';
  }
});
</script>
