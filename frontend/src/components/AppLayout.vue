<template>
  <div class="layout" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-title">総日ナビ</span>
        <button
          class="sidebar-collapse-button"
          type="button"
          :aria-label="sidebarCollapsed ? '展开导航栏' : '收起导航栏'"
          @click="toggleSidebar"
        >
          <span
            class="sidebar-collapse-icon"
            :class="{ expanded: !sidebarCollapsed }"
            aria-hidden="true"
          >
            {{ sidebarCollapsed ? '›' : '‹' }}
          </span>
        </button>
      </div>
      <nav v-show="!sidebarCollapsed">
        <RouterLink to="/" end>首页</RouterLink>
        <RouterLink v-if="isUserMode" to="/course-study">课文学习</RouterLink>
        <RouterLink v-if="isUserMode" to="/word-study">单词学习</RouterLink>
        <RouterLink v-if="isUserMode" to="/grammar-study">文法学习</RouterLink>
        <RouterLink v-if="isUserMode" to="/translation-practice">翻译练习</RouterLink>
        <RouterLink v-if="isUserMode" to="/classes">{{ isTeacher ? '班级管理' : '进入班级' }}</RouterLink>
        <RouterLink v-if="isPrivileged" to="/users">用户管理</RouterLink>
        <RouterLink v-if="isPrivileged" to="/vocabulary">词库管理</RouterLink>
        <RouterLink v-if="isPrivileged" to="/grammar">文法管理</RouterLink>
        <RouterLink v-if="isPrivileged" to="/texts">课文管理</RouterLink>
        <RouterLink v-if="isPrivileged" to="/feedback">反馈处理</RouterLink>
        <RouterLink v-if="isDev" to="/database">数据库管理</RouterLink>
      </nav>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="topbar-left">
          <h1>{{ title }}</h1>
          <div class="topbar-left-actions"></div>
        </div>
        <div class="topbar-right" v-if="user">
          <span v-if="isPrivileged" class="chip identity-chip">{{ user.username || user.email }}</span>
          <span v-if="isPrivileged" class="chip role-chip" :class="roleClass">{{ roleLabel }}</span>
          <span class="chip type-chip" :class="userTypeClass">{{ userTypeLabel }}</span>
          <button class="ghost feedback-trigger" @click="openFeedback">我要反馈</button>
          <button class="ghost" @click="handleLogout">退出</button>
        </div>
      </header>
      <main ref="contentRef" class="content">
        <router-view />
        <div
          v-if="showAssistantOrb"
          class="assistant-widget"
        >
          <div
            v-if="assistantHover && !assistantOpen"
            class="assistant-hint-bubble"
            :style="assistantHintStyle"
            aria-hidden="true"
          >
            点我就可以开始提问啦～
          </div>

          <div
            v-if="assistantOpen"
            class="assistant-chat-panel"
            :class="{ 'assistant-chat-panel-snapback': assistantPanelSnapback }"
            role="dialog"
            aria-label="AI 助手"
            :style="assistantPanelStyle"
          >
            <div
              v-for="direction in assistantResizeDirections"
              :key="direction"
              class="assistant-resize-handle"
              :class="`assistant-resize-${direction}`"
              @pointerdown.stop.prevent="startAssistantResize(direction, $event)"
            ></div>
            <div class="assistant-chat-header" @pointerdown.stop.prevent="startAssistantDrag">
              <div class="assistant-chat-title-group">
                <img class="assistant-chat-avatar" :src="assistantCurrentImage" alt="" />
                <div>
                  <h3>あーちゃん</h3>
                  <p>{{ assistantStatusText }}</p>
                </div>
              </div>
              <button class="ghost assistant-close-button" type="button" @click="closeAssistant">关闭</button>
            </div>

            <div v-if="assistantHistoryOpen" class="assistant-history-panel">
              <div class="assistant-history-header">
                <strong>对话历史</strong>
                <button class="ghost" type="button" @click="loadAssistantHistory" :disabled="assistantHistoryLoading">刷新</button>
              </div>
              <div v-if="assistantHistoryError" class="assistant-history-error">{{ assistantHistoryError }}</div>
              <div v-else-if="assistantHistoryLoading" class="assistant-history-empty">加载中...</div>
              <div v-else-if="assistantHistoryRows.length" class="assistant-history-list">
                <button
                  v-for="item in assistantHistoryRows"
                  :key="item.id"
                  class="assistant-history-item"
                  :class="{ active: assistantActiveConversation?.id === item.id }"
                  type="button"
                  @click="loadAssistantConversation(item.id)"
                >
                  <span>{{ assistantConversationTitle(item) }}</span>
                  <small>{{ item.owner_username || '-' }} · {{ formatAssistantTime(item.updated_at) }}</small>
                  <em v-if="item.last_message_excerpt">{{ item.last_message_excerpt }}</em>
                </button>
              </div>
              <div v-else class="assistant-history-empty">暂无对话历史</div>
            </div>

            <div v-if="assistantSuggestedQuestions.length && !assistantReadOnly" class="assistant-suggestions">
              <button
                v-for="question in assistantSuggestedQuestions"
                :key="question.key"
                class="ghost"
                type="button"
                :disabled="assistantBusy"
                @click="sendAssistantQuickQuestion(question)"
              >
                {{ question.label }}
              </button>
            </div>

            <div v-if="assistantReadOnly" class="assistant-readonly-note">
              正在查看共享历史，不能在该对话中继续提问。
            </div>

            <div class="assistant-chat-body">
              <div
                v-for="message in assistantMessages"
                :key="message.id"
                class="assistant-message"
                :class="`assistant-message-${message.role}`"
              >
                <div class="assistant-message-bubble">
                  <template v-if="message.role === 'assistant' && message.phase === 'thinking'">
                    <span class="assistant-thinking-text">思考中...</span>
                  </template>
                  <template v-else>
                    {{ message.content }}
                  </template>
                </div>
              </div>
            </div>

            <form class="assistant-chat-composer" @submit.prevent="submitAssistantMessage">
              <textarea
                v-model.trim="assistantInput"
                rows="3"
                :disabled="assistantBusy || assistantReadOnly"
                placeholder="输入你想问的问题..."
              ></textarea>
              <div class="assistant-chat-actions">
                <button class="ghost assistant-history-toggle" type="button" @click="toggleAssistantHistory">
                  对话历史
                </button>
                <button type="submit" :disabled="assistantBusy || assistantReadOnly || !assistantInput.trim()">
                  {{ assistantBusy ? '处理中...' : '发送' }}
                </button>
              </div>
            </form>
          </div>

          <button
            class="assistant-orb"
            :class="{ 'assistant-orb-dragging': assistantOrbDragging }"
            :style="assistantOrbStyle"
            type="button"
            aria-label="打开 AI 助手"
            @mouseenter="assistantHover = true"
            @mouseleave="assistantHover = false"
            @pointerdown.stop.prevent="startAssistantOrbPress"
            @pointermove.stop.prevent="handleAssistantOrbPointerMove"
            @pointerup.stop.prevent="finishAssistantOrbPress"
            @pointercancel.stop.prevent="cancelAssistantOrbPress"
          >
            <img :src="assistantCurrentImage" alt="" />
          </button>
        </div>
      </main>
    </div>

    <div v-if="feedbackOpen" class="overlay">
      <div class="modal feedback-submit-modal">
        <div class="modal-header">
          <h3>反馈内容</h3>
          <button class="icon-close-button" type="button" aria-label="关闭反馈弹窗" @click="closeFeedback">×</button>
        </div>
        <form @submit.prevent="submitFeedback">
          <div class="feedback-type-options" role="radiogroup" aria-label="反馈类型">
            <label v-for="option in feedbackTypes" :key="option" class="feedback-type-option">
              <input v-model="feedbackForm.feedback_type" type="radio" name="feedback_type" :value="option" />
              <span>{{ option }}</span>
            </label>
          </div>
          <textarea
            v-model.trim="feedbackForm.content"
            rows="6"
            placeholder="选择反馈类型后输入反馈内容，点击提交即可～"
          ></textarea>
          <p v-if="feedbackError" class="error">{{ feedbackError }}</p>
          <div class="modal-actions">
            <button type="submit" :disabled="feedbackSaving">{{ feedbackSaving ? '提交中...' : '提交' }}</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import assistantHappyImage from '../assistant/assistant-happy.webp';
import assistantNormalImage from '../assistant/assistant-normal.webp';
import assistantReplyingImage from '../assistant/assistant-replying.webp';
import assistantSadImage from '../assistant/assistant-sad.webp';
import assistantSleepyImage from '../assistant/assistant-sleepy.webp';
import assistantThinkingImage from '../assistant/assistant-thinking.webp';
import { useAuth } from '../composables/useAuth';
import { apiRequest, ApiError, getApiRoot, getAuthToken } from '../utils/apiClient';

const route = useRoute();
const router = useRouter();
const { state, logout, isDev, isPrivileged, isUserMode, isTeacher } = useAuth();
const contentRef = ref(null);
const sidebarCollapsed = ref(false);
const feedbackOpen = ref(false);
const feedbackSaving = ref(false);
const feedbackError = ref('');
const feedbackTypes = ['内容错误', '页面交互', '新功能请求', '其他'];
const feedbackForm = reactive({
  feedback_type: '',
  content: ''
});
const toast = reactive({ visible: false, message: '', type: 'info' });
const assistantHover = ref(false);
const assistantOpen = ref(false);
const assistantInput = ref('');
const assistantState = ref('idle');
const assistantSleepy = ref(false);
const assistantMessages = ref([
  {
    id: 1,
    role: 'assistant',
    content: '你好呀，我已经准备好啦。你可以直接向我提问。',
    phase: 'done'
  }
]);
let assistantMessageId = 2;
let assistantThinkingTimer = null;
let assistantReplyTimer = null;
let assistantSleepTimer = null;
let assistantOrbPressTimer = null;
let assistantPanelSnapbackTimer = null;
let assistantSidebarAdjustTimer = null;
const assistantResizeDirections = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
const assistantOrbSize = 96;
const assistantOrbDefaultOffset = { right: 38, bottom: 26 };
const assistantDefaultPanelSize = { width: 380, height: 520 };
const assistantOrbPosition = reactive({ left: 0, top: 0 });
const assistantOrbReady = ref(false);
const assistantOrbDragging = ref(false);
const assistantOrbDragged = ref(false);
const assistantActiveConversation = ref(null);
const assistantHistoryOpen = ref(false);
const assistantHistoryLoading = ref(false);
const assistantHistoryRows = ref([]);
const assistantHistoryError = ref('');
const assistantPanelPosition = reactive({ left: 0, top: 0 });
const assistantPanelSize = reactive({ width: assistantDefaultPanelSize.width, height: assistantDefaultPanelSize.height });
const assistantPanelReady = ref(false);
const assistantPanelSnapback = ref(false);
const assistantOrbInteraction = reactive({
  pointerId: null,
  pending: false,
  suppressOpen: false,
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0
});
const assistantInteraction = reactive({
  mode: '',
  direction: '',
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0,
  startWidth: 0,
  startHeight: 0
});
const titles = {
  Dashboard: '首页',
  Users: '用户管理',
  Vocabulary: '词库管理',
  Grammar: '文法管理',
  Texts: '课文管理',
  Feedback: '反馈处理',
  DatabaseManagement: '数据库管理',
  CourseStudy: '课文学习',
  WordStudy: '单词学习',
  GrammarStudy: '文法学习',
  Classes: '班级',
  ClassDetail: '班级详情',
  TranslationPractice: '翻译练习'
};

const user = computed(() => state.user);
const title = computed(() => {
  if (route.name === 'Dashboard' && !isPrivileged.value) return '首页';
  return titles[route.name] || '総日ナビ';
});
const roleLabel = computed(() => {
  if (!isPrivileged.value) return 'USER';
  if (user.value?.role === 'dev') return 'DEV';
  if (user.value?.role === 'admin') return 'ADMIN';
  return user.value?.role || '-';
});
const roleClass = computed(() => {
  if (!isPrivileged.value) return 'user';
  return user.value?.role || 'user';
});
const userTypeLabel = computed(() => {
  if (user.value?.user_type === 'teacher') return '教师用户';
  if (user.value?.user_type === 'student') return '学生用户';
  return user.value?.user_type || '-';
});
const userTypeClass = computed(() => {
  const normalized = String(user.value?.user_type || '').trim().toLowerCase();
  return normalized ? `type-${normalized}` : 'type-unknown';
});
const showAssistantOrb = computed(() => Boolean(user.value && isUserMode.value));
const assistantBusy = computed(() => assistantState.value === 'thinking' || assistantState.value === 'replying');
const assistantHappyActive = computed(() => !assistantBusy.value && (assistantHover.value || assistantOpen.value));
const assistantCurrentImage = computed(() => {
  if (assistantOrbDragging.value) return assistantSadImage;
  if (assistantState.value === 'thinking') return assistantThinkingImage;
  if (assistantState.value === 'replying') return assistantReplyingImage;
  if (assistantSleepy.value) return assistantSleepyImage;
  if (assistantHover.value || assistantOpen.value) return assistantHappyImage;
  return assistantNormalImage;
});
const assistantStatusText = computed(() => {
  if (assistantState.value === 'thinking') return '正在思考中';
  if (assistantState.value === 'replying') return '正在回复中';
  if (assistantSleepy.value) return '我先休息一下';
  return '你的智能日语学习助手';
});
const assistantSuggestedQuestions = computed(() => assistantActiveConversation.value?.suggested_questions || []);
const assistantReadOnly = computed(() => Boolean(assistantActiveConversation.value?.is_read_only));
const assistantOrbStyle = computed(() => ({
  left: `${assistantOrbPosition.left}px`,
  top: `${assistantOrbPosition.top}px`
}));
const assistantHintStyle = computed(() => {
  const contentRect = contentRef.value?.getBoundingClientRect?.();
  const leftBase = contentRect?.left || 0;
  const topBase = contentRect?.top || 0;

  return {
    left: `${leftBase + assistantOrbPosition.left - 72}px`,
    top: `${topBase + assistantOrbPosition.top - 10}px`
  };
});
const assistantPanelStyle = computed(() => ({
  left: `${assistantPanelPosition.left}px`,
  top: `${assistantPanelPosition.top}px`,
  width: `${assistantPanelSize.width}px`,
  height: `${assistantPanelSize.height}px`
}));

function showToast(message, type = 'info') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  setTimeout(() => {
    toast.visible = false;
  }, 1600);
}

function mapAssistantMessage(message) {
  return {
    id: message.id || `${message.role}-${Date.now()}-${Math.random()}`,
    role: message.role === 'user' ? 'user' : 'assistant',
    content: message.content || '',
    phase: 'done'
  };
}

function setAssistantConversation(payload) {
  assistantActiveConversation.value = payload?.conversation || null;
  assistantMessages.value = (payload?.messages || []).map(mapAssistantMessage);
  const maxMessageId = assistantMessages.value.reduce((max, message) => {
    const id = Number(message.id);
    return Number.isFinite(id) ? Math.max(max, id) : max;
  }, assistantMessageId);
  assistantMessageId = maxMessageId + 1;
  assistantHistoryOpen.value = false;
  assistantState.value = 'idle';
}

function assistantConversationTitle(item) {
  if (!item) return '自由提问';
  if (item.context_type === 'vocabulary') return `单词：${item.context_label || '-'}`;
  if (item.context_type === 'grammar') return `文法：${item.context_label || '-'}`;
  if (item.context_type === 'text') return `文章：${item.context_label || '-'}`;
  return item.context_label || '自由提问';
}

function formatAssistantTime(value) {
  return String(value || '').replace(/:\d{2}$/, '');
}

function assistantHistoryParams() {
  const conversation = assistantActiveConversation.value;
  if (conversation?.context_type && conversation.context_type !== 'none' && conversation.context_id) {
    return {
      context_type: conversation.context_type,
      context_id: conversation.context_id
    };
  }
  return {};
}

async function ensureAssistantConversation() {
  if (assistantActiveConversation.value && !assistantReadOnly.value) return assistantActiveConversation.value;
  const data = await apiRequest('/api/user/assistant/conversations', {
    method: 'POST',
    body: { context_type: 'none' },
    timeout: 30000
  });
  setAssistantConversation(data);
  return assistantActiveConversation.value;
}

async function loadAssistantConversation(id) {
  try {
    const data = await apiRequest(`/api/user/assistant/conversations/${id}`, { timeout: 30000 });
    setAssistantConversation(data);
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : '加载对话失败', 'error');
  }
}

async function loadAssistantHistory() {
  assistantHistoryLoading.value = true;
  assistantHistoryError.value = '';
  try {
    const data = await apiRequest('/api/user/assistant/conversations', {
      params: {
        limit: 80,
        ...assistantHistoryParams()
      },
      timeout: 30000
    });
    assistantHistoryRows.value = data.rows || [];
  } catch (err) {
    assistantHistoryError.value = err instanceof ApiError ? err.message : '加载失败';
  } finally {
    assistantHistoryLoading.value = false;
  }
}

async function toggleAssistantHistory() {
  assistantHistoryOpen.value = !assistantHistoryOpen.value;
  if (assistantHistoryOpen.value) {
    await loadAssistantHistory();
  }
}

function parseSseBlock(block) {
  const eventLine = block.split(/\n/).find((line) => line.startsWith('event:'));
  const dataLines = block.split(/\n/).filter((line) => line.startsWith('data:'));
  const event = eventLine ? eventLine.replace(/^event:\s*/, '').trim() : 'message';
  const dataText = dataLines.map((line) => line.replace(/^data:\s*/, '')).join('\n');
  try {
    return { event, data: JSON.parse(dataText) };
  } catch (error) {
    return { event, data: null };
  }
}

function typeAssistantFullText(message, content) {
  return new Promise((resolve) => {
    if (!content) {
      resolve();
      return;
    }
    let index = 0;
    message.content = '';
    message.phase = 'replying';
    assistantState.value = 'replying';
    if (assistantReplyTimer) clearInterval(assistantReplyTimer);
    assistantReplyTimer = setInterval(() => {
      message.content += content.slice(index, index + 3);
      index += 3;
      if (index >= content.length) {
        clearInterval(assistantReplyTimer);
        assistantReplyTimer = null;
        message.content = content;
        message.phase = 'done';
        assistantState.value = 'idle';
        resolve();
      }
    }, 18);
  });
}

async function streamAssistantMessage({ conversationId, content, templateKey, forceWebSearch, replyMessage }) {
  const response = await fetch(`${getApiRoot()}/api/user/assistant/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify({
      content,
      template_key: templateKey,
      force_web_search: !!forceWebSearch
    })
  });

  if (!response.ok || !response.body) {
    const errorPayload = await response.json().catch(() => null);
    throw new ApiError(errorPayload?.error || 'AI 回复失败', { status: response.status });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let receivedDelta = false;

  async function processBlock(block) {
    if (!block.trim()) return;
    const payload = parseSseBlock(block);
    if (payload.event === 'delta' && payload.data?.content) {
      if (!receivedDelta) {
        replyMessage.content = '';
        replyMessage.phase = 'replying';
        assistantState.value = 'replying';
        receivedDelta = true;
      }
      replyMessage.content += payload.data.content;
      return;
    }

    if (payload.event === 'done') {
      if (payload.data?.conversation) {
        assistantActiveConversation.value = payload.data.conversation;
      }
      const finalContent = payload.data?.message?.content || replyMessage.content;
      if (!receivedDelta && finalContent) {
        await typeAssistantFullText(replyMessage, finalContent);
      } else {
        replyMessage.content = finalContent;
        replyMessage.phase = 'done';
        assistantState.value = 'idle';
      }
      return;
    }

    if (payload.event === 'error') {
      throw new ApiError(payload.data?.error || 'AI 回复失败', { status: payload.data?.status || 500 });
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\n\n+/);
    buffer = blocks.pop() || '';

    for (const block of blocks) {
      await processBlock(block);
    }
  }

  if (buffer.trim()) {
    await processBlock(buffer);
  }

  if (assistantState.value !== 'idle') {
    replyMessage.phase = 'done';
    assistantState.value = 'idle';
  }
}

function openFeedback() {
  feedbackError.value = '';
  feedbackForm.feedback_type = '';
  feedbackForm.content = '';
  feedbackOpen.value = true;
}

function closeFeedback() {
  feedbackOpen.value = false;
  feedbackError.value = '';
}

function toggleSidebar() {
  const previousContentLeft = contentRef.value?.getBoundingClientRect?.().left || 0;
  sidebarCollapsed.value = !sidebarCollapsed.value;
  preserveAssistantOrbViewportPosition(previousContentLeft);
}

function assistantContentMetrics() {
  const width = contentRef.value?.clientWidth || window.innerWidth;
  const height = contentRef.value?.clientHeight || window.innerHeight;
  return { width, height };
}

function assistantDefaultPanelPlacement() {
  const metrics = assistantContentMetrics();
  return {
    left: Math.max(12, metrics.width - assistantDefaultPanelSize.width - 34),
    top: Math.max(12, metrics.height - assistantDefaultPanelSize.height - 128)
  };
}

function assistantPanelPlacementFromOrb() {
  return {
    left: assistantOrbPosition.left + assistantOrbSize - assistantDefaultPanelSize.width + 16,
    top: assistantOrbPosition.top - assistantDefaultPanelSize.height + 18
  };
}

function assistantPlacementIsValid(left, top, width, height) {
  const margin = 12;
  const metrics = assistantContentMetrics();
  return (
    left >= margin &&
    top >= margin &&
    left + width <= metrics.width - margin &&
    top + height <= metrics.height - margin
  );
}

function clampAssistantOrb() {
  const margin = 8;
  const metrics = assistantContentMetrics();
  const maxLeft = Math.max(margin, metrics.width - assistantOrbSize - margin);
  const maxTop = Math.max(margin, metrics.height - assistantOrbSize - margin);
  assistantOrbPosition.left = Math.min(Math.max(assistantOrbPosition.left, margin), maxLeft);
  assistantOrbPosition.top = Math.min(Math.max(assistantOrbPosition.top, margin), maxTop);
}

function ensureAssistantOrbPosition() {
  if (assistantOrbReady.value) {
    clampAssistantOrb();
    return;
  }

  const metrics = assistantContentMetrics();
  assistantOrbPosition.left = Math.max(8, metrics.width - assistantOrbSize - assistantOrbDefaultOffset.right);
  assistantOrbPosition.top = Math.max(8, metrics.height - assistantOrbSize - assistantOrbDefaultOffset.bottom);
  assistantOrbReady.value = true;
  clampAssistantOrb();
}

function clampAssistantPanel() {
  const margin = 12;
  const metrics = assistantContentMetrics();
  const maxWidth = Math.max(320, metrics.width - margin * 2);
  const maxHeight = Math.max(360, metrics.height - margin * 2);

  assistantPanelSize.width = Math.min(Math.max(assistantPanelSize.width, 320), maxWidth);
  assistantPanelSize.height = Math.min(Math.max(assistantPanelSize.height, 360), maxHeight);

  const maxLeft = Math.max(margin, metrics.width - assistantPanelSize.width - margin);
  const maxTop = Math.max(margin, metrics.height - assistantPanelSize.height - margin);
  assistantPanelPosition.left = Math.min(Math.max(assistantPanelPosition.left, margin), maxLeft);
  assistantPanelPosition.top = Math.min(Math.max(assistantPanelPosition.top, margin), maxTop);
}

function ensureAssistantPanelPosition() {
  if (assistantPanelReady.value) {
    clampAssistantPanel();
    return;
  }

  const target = assistantDefaultPanelPlacement();
  assistantPanelPosition.left = target.left;
  assistantPanelPosition.top = target.top;
  assistantPanelReady.value = true;
  clampAssistantPanel();
}

function resetAssistantPanelState() {
  assistantPanelReady.value = false;
  assistantPanelPosition.left = 0;
  assistantPanelPosition.top = 0;
  assistantPanelSize.width = assistantDefaultPanelSize.width;
  assistantPanelSize.height = assistantDefaultPanelSize.height;
}

function clearAssistantSleepTimer() {
  if (assistantSleepTimer) {
    clearTimeout(assistantSleepTimer);
    assistantSleepTimer = null;
  }
}

function clearAssistantOrbPressTimer() {
  if (assistantOrbPressTimer) {
    clearTimeout(assistantOrbPressTimer);
    assistantOrbPressTimer = null;
  }
}

function clearAssistantPanelSnapbackTimer() {
  if (assistantPanelSnapbackTimer) {
    clearTimeout(assistantPanelSnapbackTimer);
    assistantPanelSnapbackTimer = null;
  }
}

function clearAssistantSidebarAdjustTimer() {
  if (assistantSidebarAdjustTimer) {
    clearTimeout(assistantSidebarAdjustTimer);
    assistantSidebarAdjustTimer = null;
  }
}

function preserveAssistantOrbViewportPosition(previousContentLeft) {
  if (!showAssistantOrb.value || !assistantOrbReady.value) return;
  clearAssistantSidebarAdjustTimer();

  const previousViewportLeft = previousContentLeft + assistantOrbPosition.left;
  assistantSidebarAdjustTimer = setTimeout(() => {
    const nextContentLeft = contentRef.value?.getBoundingClientRect?.().left || 0;
    assistantOrbPosition.left = previousViewportLeft - nextContentLeft;
    clampAssistantOrb();
    assistantSidebarAdjustTimer = null;
  }, 190);
}

function scheduleAssistantSleep() {
  clearAssistantSleepTimer();
  if (!showAssistantOrb.value || assistantHappyActive.value || assistantBusy.value) return;

  assistantSleepTimer = setTimeout(() => {
    if (!assistantHappyActive.value && !assistantBusy.value) {
      assistantSleepy.value = true;
      assistantSleepTimer = null;
      return;
    }
    scheduleAssistantSleep();
  }, 180000);
}

function clearAssistantTimers() {
  if (assistantThinkingTimer) {
    clearTimeout(assistantThinkingTimer);
    assistantThinkingTimer = null;
  }
  if (assistantReplyTimer) {
    clearInterval(assistantReplyTimer);
    assistantReplyTimer = null;
  }
  clearAssistantSleepTimer();
  clearAssistantOrbPressTimer();
  clearAssistantPanelSnapbackTimer();
  clearAssistantSidebarAdjustTimer();
}

async function openAssistant() {
  ensureAssistantOrbPosition();
  clearAssistantPanelSnapbackTimer();
  assistantPanelSnapback.value = false;
  assistantPanelSize.width = assistantDefaultPanelSize.width;
  assistantPanelSize.height = assistantDefaultPanelSize.height;
  assistantPanelReady.value = true;

  const desired = assistantOrbDragged.value ? assistantPanelPlacementFromOrb() : assistantDefaultPanelPlacement();
  assistantPanelPosition.left = desired.left;
  assistantPanelPosition.top = desired.top;
  assistantOpen.value = true;

  await nextTick();

  if (!assistantOrbDragged.value || assistantPlacementIsValid(desired.left, desired.top, assistantPanelSize.width, assistantPanelSize.height)) {
    clampAssistantPanel();
    return;
  }

  assistantPanelSnapback.value = true;
  requestAnimationFrame(() => {
    const fallback = assistantDefaultPanelPlacement();
    assistantPanelSize.width = assistantDefaultPanelSize.width;
    assistantPanelSize.height = assistantDefaultPanelSize.height;
    assistantPanelPosition.left = fallback.left;
    assistantPanelPosition.top = fallback.top;
    clampAssistantPanel();
    assistantPanelSnapbackTimer = setTimeout(() => {
      assistantPanelSnapback.value = false;
      assistantPanelSnapbackTimer = null;
    }, 320);
  });
}

function closeAssistant() {
  assistantOpen.value = false;
  stopAssistantInteraction();
  cancelAssistantOrbPress();
  assistantPanelSnapback.value = false;
  resetAssistantPanelState();
}

function beginAssistantInteraction(mode, direction, event) {
  ensureAssistantPanelPosition();
  assistantPanelSnapback.value = false;
  assistantInteraction.mode = mode;
  assistantInteraction.direction = direction;
  assistantInteraction.startX = event.clientX;
  assistantInteraction.startY = event.clientY;
  assistantInteraction.startLeft = assistantPanelPosition.left;
  assistantInteraction.startTop = assistantPanelPosition.top;
  assistantInteraction.startWidth = assistantPanelSize.width;
  assistantInteraction.startHeight = assistantPanelSize.height;

  window.addEventListener('pointermove', handleAssistantPointerMove);
  window.addEventListener('pointerup', stopAssistantInteraction);
}

function startAssistantDrag(event) {
  beginAssistantInteraction('drag', '', event);
}

function startAssistantResize(direction, event) {
  beginAssistantInteraction('resize', direction, event);
}

function startAssistantOrbPress(event) {
  ensureAssistantOrbPosition();
  clearAssistantOrbPressTimer();
  assistantOrbInteraction.pointerId = event.pointerId;
  assistantOrbInteraction.pending = true;
  assistantOrbInteraction.suppressOpen = false;
  assistantOrbInteraction.startX = event.clientX;
  assistantOrbInteraction.startY = event.clientY;
  assistantOrbInteraction.startLeft = assistantOrbPosition.left;
  assistantOrbInteraction.startTop = assistantOrbPosition.top;
  assistantHover.value = true;
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  assistantOrbPressTimer = setTimeout(() => {
    assistantOrbDragging.value = true;
    assistantOrbInteraction.pending = false;
    assistantOrbInteraction.suppressOpen = true;
    assistantSleepy.value = false;
    clearAssistantSleepTimer();
    assistantOrbPressTimer = null;
  }, 320);
}

function handleAssistantOrbPointerMove(event) {
  if (assistantOrbInteraction.pointerId !== event.pointerId) return;

  const dx = event.clientX - assistantOrbInteraction.startX;
  const dy = event.clientY - assistantOrbInteraction.startY;

  if (assistantOrbDragging.value) {
    assistantOrbPosition.left = assistantOrbInteraction.startLeft + dx;
    assistantOrbPosition.top = assistantOrbInteraction.startTop + dy;
    assistantHover.value = false;
    assistantOrbDragged.value = true;
    clampAssistantOrb();
    return;
  }

  if (!assistantOrbInteraction.pending) return;
  if (Math.hypot(dx, dy) > 8) {
    clearAssistantOrbPressTimer();
    assistantOrbInteraction.pending = false;
    assistantOrbInteraction.suppressOpen = true;
  }
}

function finishAssistantOrbPress(event) {
  if (assistantOrbInteraction.pointerId !== event.pointerId) return;
  event.currentTarget?.releasePointerCapture?.(event.pointerId);
  clearAssistantOrbPressTimer();

  const shouldOpen = assistantOrbInteraction.pending && !assistantOrbInteraction.suppressOpen && !assistantOrbDragging.value;
  assistantOrbInteraction.pointerId = null;
  assistantOrbInteraction.pending = false;
  assistantOrbInteraction.suppressOpen = false;

  if (assistantOrbDragging.value) {
    assistantOrbDragging.value = false;
    assistantHover.value = false;
    scheduleAssistantSleep();
    return;
  }

  if (shouldOpen) {
    openAssistant();
  }
}

function cancelAssistantOrbPress() {
  clearAssistantOrbPressTimer();
  assistantOrbInteraction.pointerId = null;
  assistantOrbInteraction.pending = false;
  assistantOrbInteraction.suppressOpen = false;
  if (assistantOrbDragging.value) {
    assistantOrbDragging.value = false;
    scheduleAssistantSleep();
  }
}

function handleAssistantPointerMove(event) {
  if (!assistantInteraction.mode) return;

  const dx = event.clientX - assistantInteraction.startX;
  const dy = event.clientY - assistantInteraction.startY;

  if (assistantInteraction.mode === 'drag') {
    assistantPanelPosition.left = assistantInteraction.startLeft + dx;
    assistantPanelPosition.top = assistantInteraction.startTop + dy;
    clampAssistantPanel();
    return;
  }

  const direction = assistantInteraction.direction;
  const margin = 12;
  const metrics = assistantContentMetrics();
  const minWidth = 320;
  const minHeight = 360;

  let nextLeft = assistantInteraction.startLeft;
  let nextTop = assistantInteraction.startTop;
  let nextWidth = assistantInteraction.startWidth;
  let nextHeight = assistantInteraction.startHeight;

  if (direction.includes('e')) {
    nextWidth = assistantInteraction.startWidth + dx;
  }
  if (direction.includes('s')) {
    nextHeight = assistantInteraction.startHeight + dy;
  }
  if (direction.includes('w')) {
    nextWidth = assistantInteraction.startWidth - dx;
    nextLeft = assistantInteraction.startLeft + dx;
  }
  if (direction.includes('n')) {
    nextHeight = assistantInteraction.startHeight - dy;
    nextTop = assistantInteraction.startTop + dy;
  }

  if (nextWidth < minWidth) {
    if (direction.includes('w')) {
      nextLeft -= minWidth - nextWidth;
    }
    nextWidth = minWidth;
  }
  if (nextHeight < minHeight) {
    if (direction.includes('n')) {
      nextTop -= minHeight - nextHeight;
    }
    nextHeight = minHeight;
  }

  const maxWidth = Math.max(minWidth, metrics.width - margin * 2);
  const maxHeight = Math.max(minHeight, metrics.height - margin * 2);
  nextWidth = Math.min(nextWidth, maxWidth);
  nextHeight = Math.min(nextHeight, maxHeight);

  if (nextLeft < margin) {
    if (direction.includes('w')) {
      nextWidth -= margin - nextLeft;
    }
    nextLeft = margin;
  }
  if (nextTop < margin) {
    if (direction.includes('n')) {
      nextHeight -= margin - nextTop;
    }
    nextTop = margin;
  }

  if (nextLeft + nextWidth > metrics.width - margin) {
    if (direction.includes('e')) {
      nextWidth = metrics.width - margin - nextLeft;
    } else {
      nextLeft = metrics.width - margin - nextWidth;
    }
  }
  if (nextTop + nextHeight > metrics.height - margin) {
    if (direction.includes('s')) {
      nextHeight = metrics.height - margin - nextTop;
    } else {
      nextTop = metrics.height - margin - nextHeight;
    }
  }

  assistantPanelPosition.left = nextLeft;
  assistantPanelPosition.top = nextTop;
  assistantPanelSize.width = Math.max(minWidth, nextWidth);
  assistantPanelSize.height = Math.max(minHeight, nextHeight);
  clampAssistantPanel();
}

function stopAssistantInteraction() {
  assistantInteraction.mode = '';
  assistantInteraction.direction = '';
  window.removeEventListener('pointermove', handleAssistantPointerMove);
  window.removeEventListener('pointerup', stopAssistantInteraction);
}

async function sendAssistantMessage({ content, templateKey, forceWebSearch } = {}) {
  const question = String(content || '').trim();
  if (!question || assistantBusy.value) return;
  if (assistantReadOnly.value) {
    showToast('共享历史只能查看，不能继续提问', 'error');
    return;
  }

  let conversation;
  try {
    conversation = await ensureAssistantConversation();
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : '创建对话失败', 'error');
    return;
  }

  const userMessage = {
    id: assistantMessageId++,
    role: 'user',
    content: question,
    phase: 'done'
  };
  const replyMessage = {
    id: assistantMessageId++,
    role: 'assistant',
    content: '',
    phase: 'thinking'
  };

  assistantMessages.value.push(userMessage, replyMessage);
  assistantInput.value = '';
  assistantOpen.value = true;
  assistantState.value = 'thinking';
  clearAssistantSleepTimer();
  if (assistantReplyTimer) {
    clearInterval(assistantReplyTimer);
    assistantReplyTimer = null;
  }

  try {
    await streamAssistantMessage({
      conversationId: conversation.id,
      content: question,
      templateKey,
      forceWebSearch,
      replyMessage
    });
    if (assistantHistoryOpen.value) {
      await loadAssistantHistory();
    }
  } catch (err) {
    replyMessage.phase = 'done';
    replyMessage.content = err instanceof ApiError ? err.message : 'AI 回复失败，请稍后重试';
    assistantState.value = 'idle';
    showToast(replyMessage.content, 'error');
  }
}

function submitAssistantMessage() {
  sendAssistantMessage({ content: assistantInput.value });
}

function sendAssistantQuickQuestion(question) {
  sendAssistantMessage({
    content: question?.message || question?.label,
    templateKey: question?.template_key,
    forceWebSearch: question?.force_web_search
  });
}

async function openAssistantContext(contextType, id) {
  if (!showAssistantOrb.value) return;
  if (!id || assistantBusy.value) {
    showToast(assistantBusy.value ? 'AI 正在回复中' : '条目信息无效', 'error');
    return;
  }

  try {
    const data = await apiRequest(`/api/user/assistant/context/${contextType}/${id}`, {
      method: 'POST',
      timeout: 30000
    });
    setAssistantConversation(data);
    assistantHistoryRows.value = [];
    assistantHistoryError.value = '';
    await openAssistant();
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : '打开 AI 提问失败', 'error');
  }
}

function handleAssistantContextEvent(event) {
  const detail = event?.detail || {};
  if (detail.contextType === 'vocabulary') {
    openAssistantContext('vocabulary', detail.id);
    return;
  }
  if (detail.contextType === 'grammar') {
    openAssistantContext('grammar', detail.id);
  }
}

async function submitFeedback() {
  feedbackError.value = '';
  if (!feedbackForm.feedback_type) {
    feedbackError.value = '请选择反馈类型';
    return;
  }
  if (!feedbackForm.content.trim()) {
    feedbackError.value = '请输入反馈内容';
    return;
  }

  feedbackSaving.value = true;
  try {
    await apiRequest('/api/feedback/submit', {
      method: 'POST',
      body: {
        feedback_type: feedbackForm.feedback_type,
        content: feedbackForm.content.trim()
      }
    });
    closeFeedback();
    showToast('反馈已提交', 'success');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      feedbackError.value = '登录已过期，请重新登录';
      logout();
      router.push({ name: 'Login' });
      return;
    }
    feedbackError.value = err instanceof ApiError ? err.message : '提交失败';
  } finally {
    feedbackSaving.value = false;
  }
}

function handleLogout() {
  clearAssistantTimers();
  logout();
  router.push({ name: 'Login' });
}

onMounted(() => {
  ensureAssistantOrbPosition();
  window.addEventListener('resize', clampAssistantPanel);
  window.addEventListener('resize', clampAssistantOrb);
  window.addEventListener('assistant:context', handleAssistantContextEvent);
});

watch(showAssistantOrb, (visible) => {
  if (!visible) {
    assistantSleepy.value = false;
    clearAssistantSleepTimer();
    return;
  }
  scheduleAssistantSleep();
}, { immediate: true });

watch(assistantHappyActive, (isHappy) => {
  if (isHappy) {
    assistantSleepy.value = false;
    clearAssistantSleepTimer();
    return;
  }
  scheduleAssistantSleep();
}, { immediate: true });

watch(assistantBusy, (busy) => {
  if (busy) {
    assistantSleepy.value = false;
    clearAssistantSleepTimer();
    return;
  }
  scheduleAssistantSleep();
});

onBeforeUnmount(() => {
  clearAssistantTimers();
  stopAssistantInteraction();
  cancelAssistantOrbPress();
  window.removeEventListener('resize', clampAssistantPanel);
  window.removeEventListener('resize', clampAssistantOrb);
  window.removeEventListener('assistant:context', handleAssistantContextEvent);
});
</script>
