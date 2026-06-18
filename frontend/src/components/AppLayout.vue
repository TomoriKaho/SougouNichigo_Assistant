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
          <button
            v-if="topbarBackLabel"
            class="ghost topbar-back-button"
            type="button"
            @click="handleTopbarBackClick"
          >
            {{ topbarBackLabel }}
          </button>
          <h1>{{ title }}</h1>
          <div class="topbar-left-actions"></div>
        </div>
        <div class="topbar-right" v-if="user">
          <span v-if="isPrivileged" class="chip identity-chip">{{ user.username || user.email }}</span>
          <span v-if="isPrivileged" class="chip role-chip" :class="roleClass">{{ roleLabel }}</span>
          <span class="chip type-chip" :class="userTypeClass">{{ userTypeLabel }}</span>
          <button v-if="showAssistantTopbarButton" class="ghost assistant-topbar-trigger" @click="openAssistantFromTopbar">AI助手</button>
          <button class="ghost feedback-trigger" @click="openFeedback">我要反馈</button>
          <button class="ghost" @click="handleLogout">退出</button>
        </div>
      </header>
      <main ref="contentRef" class="content">
        <router-view />
        <div
          v-if="showAssistantWidget"
          class="assistant-widget"
        >
          <div
            v-if="showAssistantOrb && assistantHover && !assistantOpen"
            class="assistant-hint-bubble"
            :style="assistantHintStyle"
            aria-hidden="true"
          >
            点我就可以开始提问啦～
          </div>

          <div
            v-if="assistantOpen"
            class="assistant-chat-panel"
            :class="{
              'assistant-chat-panel-snapback': assistantPanelSnapback,
              'assistant-chat-panel-topbar': assistantLaunchSource === 'topbar'
            }"
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
            <div
              class="assistant-chat-header"
              @pointerdown.stop.prevent="startAssistantDrag"
              @dblclick.stop.prevent="toggleAssistantPanelMaximize"
            >
              <div class="assistant-chat-title-group">
                <img class="assistant-chat-avatar" :src="assistantCurrentImage" alt="" />
                <div>
                  <h3>あーちゃん</h3>
                  <p>{{ assistantStatusText }}</p>
                </div>
              </div>
              <button class="ghost assistant-close-button" type="button" @click="closeAssistant">关闭</button>
            </div>

            <div v-if="assistantHistoryOpen" class="assistant-history-screen" @pointerdown.capture="handleAssistantHistoryPointerDown">
              <div class="assistant-history-header">
                <div class="assistant-history-title-row">
                  <strong>{{ assistantHistoryTitle }}</strong>
                  <select
                    v-if="assistantHistoryMode === 'own'"
                    v-model="assistantHistoryContextFilter"
                    class="assistant-history-filter-select"
                    :disabled="assistantHistoryLoading"
                    @change="handleAssistantHistoryFilterChange"
                  >
                    <option value="all">全部历史</option>
                    <option value="text">课文内容提问</option>
                    <option value="vocabulary">单词提问</option>
                    <option value="grammar">文法提问</option>
                  </select>
                </div>
                <div class="assistant-history-header-actions">
                  <div v-if="assistantHistoryTotalPages > 1" class="assistant-history-pagination">
                    <button
                      class="ghost assistant-history-pagination-button"
                      type="button"
                      :disabled="assistantHistoryLoading || assistantHistoryPage <= 1"
                      @click="changeAssistantHistoryPage(assistantHistoryPage - 1)"
                    >
                      <
                    </button>
                    <span class="assistant-history-pagination-text">第 {{ assistantHistoryPage }} / {{ assistantHistoryTotalPages }} 页</span>
                    <button
                      class="ghost assistant-history-pagination-button"
                      type="button"
                      :disabled="assistantHistoryLoading || assistantHistoryPage >= assistantHistoryTotalPages"
                      @click="changeAssistantHistoryPage(assistantHistoryPage + 1)"
                    >
                      >
                    </button>
                  </div>
                  <button class="ghost" type="button" @click="refreshAssistantHistoryView" :disabled="assistantHistoryLoading">刷新</button>
                  <button class="ghost" type="button" @click="handleAssistantHistoryBack">返回</button>
                </div>
              </div>
              <div class="assistant-history-body">
                <div v-if="assistantHistoryError" class="assistant-history-error">{{ assistantHistoryError }}</div>
                <div v-else-if="assistantHistoryLoading" class="assistant-history-empty">加载中...</div>
                <div v-else-if="assistantHistoryRows.length" class="assistant-history-list">
                  <div
                    v-for="item in assistantHistoryRows"
                    :key="item.id"
                    class="assistant-history-item"
                    :class="{ active: assistantActiveConversation?.id === item.id }"
                  >
                    <div
                      class="assistant-history-item-main"
                      role="button"
                      tabindex="0"
                      @click="activateAssistantHistoryItem(item)"
                      @keydown.enter.stop.prevent="activateAssistantHistoryItem(item)"
                      @keydown.space.stop.prevent="activateAssistantHistoryItem(item)"
                    >
                      <div class="assistant-history-item-header">
                        <template v-if="assistantHistoryMode === 'own' && assistantRenameConversationId === item.id">
                          <input
                            ref="assistantRenameInputRef"
                            v-model.trim="assistantRenameDraft"
                            class="assistant-history-rename-input"
                            type="text"
                            maxlength="12"
                            @click.stop
                            @keydown.enter.stop.prevent="submitAssistantConversationRename(item)"
                            @keydown.esc.stop.prevent="cancelAssistantConversationRename"
                            @blur="submitAssistantConversationRename(item)"
                          />
                        </template>
                          <span
                            v-else-if="assistantHistoryMode === 'own'"
                            class="assistant-history-title-trigger"
                            :title="assistantConversationDisplayTitle(item)"
                            @click.stop.prevent="startAssistantConversationRename(item)"
                          >
                            {{ assistantConversationDisplayTitle(item) }}
                          </span>
                          <span
                            v-else
                            :title="assistantConversationDisplayTitle(item)"
                          >
                            {{ assistantConversationDisplayTitle(item) }}
                          </span>
                        <small>{{ formatAssistantTime(item.updated_at) }}</small>
                      </div>
                      <em v-if="item.last_message_excerpt">{{ item.last_message_excerpt }}</em>
                    </div>
                    <button
                      v-if="assistantHistoryMode === 'own'"
                      class="assistant-history-item-delete"
                      type="button"
                      :disabled="assistantChatLocked"
                      @click="deleteAssistantConversation(item)"
                    >
                      删除
                    </button>
                  </div>
                </div>
                <div v-else class="assistant-history-empty">{{ assistantHistoryEmptyText }}</div>
              </div>
            </div>

            <div v-else class="assistant-chat-screen">
              <div v-if="assistantReadOnly" class="assistant-readonly-note">
                <span>正在查看共享历史</span>
                <button
                  class="ghost assistant-readonly-return"
                  type="button"
                  @click="returnToAssistantSharedHistory"
                >
                  返回
                </button>
              </div>

              <div ref="assistantChatBodyRef" class="assistant-chat-body" @scroll.passive="handleAssistantChatScroll">
                <div
                  v-for="message in assistantMessages"
                  :key="message.id"
                  class="assistant-message"
                  :class="`assistant-message-${message.role}`"
                >
                  <div class="assistant-message-stack">
                    <div class="assistant-message-bubble">
                      <template v-if="message.role === 'assistant' && message.phase === 'thinking'">
                        <span class="assistant-thinking-text">思考中...</span>
                      </template>
                      <template v-else-if="message.role === 'assistant' && message.phase === 'replying'">
                        <div class="assistant-message-streaming">
                          <div
                            v-if="assistantStreamingRenderedHtml(message)"
                            class="assistant-message-markdown assistant-message-markdown-stream"
                            v-html="assistantStreamingRenderedHtml(message)"
                          ></div>
                          <div
                            v-if="assistantStreamingPendingText(message) || !assistantStreamingRenderedHtml(message)"
                            class="assistant-message-plain assistant-message-plain-stream"
                            v-html="renderAssistantStreamingText(assistantStreamingPendingText(message))"
                          ></div>
                        </div>
                      </template>
                      <template v-else>
                        <div
                          class="assistant-message-markdown"
                          v-html="renderAssistantMarkdown(assistantMessageDisplayContent(message))"
                        ></div>
                      </template>
                    </div>
                    <div class="assistant-message-meta">
                      <template v-if="message.role === 'assistant'">
                        <button
                          class="assistant-message-copy"
                          type="button"
                          aria-label="复制助手消息"
                          :disabled="!assistantMessageCopyContent(message)"
                          @click="copyAssistantMessage(assistantMessageCopyContent(message))"
                        >
                          <span aria-hidden="true">⧉</span>
                        </button>
                        <time>{{ formatAssistantMessageClock(message.created_at) }}</time>
                      </template>
                      <template v-else>
                        <time>{{ formatAssistantMessageClock(message.created_at) }}</time>
                        <button
                          class="assistant-message-copy"
                          type="button"
                          aria-label="复制用户消息"
                          :disabled="!assistantMessageCopyContent(message)"
                          @click="copyAssistantMessage(assistantMessageCopyContent(message))"
                        >
                          <span aria-hidden="true">⧉</span>
                        </button>
                      </template>
                    </div>
                  </div>
                </div>

                <div
                  v-if="((assistantSuggestedQuestions.length && !assistantChatLocked) || assistantCanViewSharedHistory) && !assistantReadOnly"
                  class="assistant-message assistant-message-assistant assistant-message-suggestions"
                >
                  <div class="assistant-message-stack assistant-suggestion-stack">
                    <div v-if="assistantSuggestedQuestions.length && !assistantChatLocked" class="assistant-suggestion-caption">你也可以直接点下面的问题：</div>
                    <div v-if="assistantSuggestedQuestions.length && !assistantChatLocked" class="assistant-inline-suggestions">
                      <button
                        v-for="question in assistantSuggestedQuestions"
                        :key="question.key"
                        class="ghost"
                        type="button"
                        :disabled="assistantChatLocked"
                        @click="sendAssistantQuickQuestion(question)"
                      >
                        {{ question.label }}
                      </button>
                    </div>
                    <div v-if="assistantCanViewSharedHistory" class="assistant-suggestion-alt">
                      <span class="assistant-suggestion-caption assistant-suggestion-alt-label">或是</span>
                      <button
                        class="assistant-suggestion-alt-button"
                        type="button"
                        :disabled="assistantHistoryLoading"
                        @click="openAssistantSharedHistory"
                      >
                        看看其他同学的提问历史
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="assistant-chat-disclaimer">AI回答可能会犯错，请核实重要信息。</div>

              <form class="assistant-chat-composer" @submit.prevent="submitAssistantMessage">
                <textarea
                  v-model.trim="assistantInput"
                  :class="{ 'assistant-input-invalid': assistantInputTooLong }"
                  rows="3"
                  :disabled="assistantChatLocked || assistantReadOnly"
                  placeholder="输入你想问的问题
按 Enter 键发送，Shift+Enter 键换行"
                  @keydown="handleAssistantComposerKeydown"
                ></textarea>
                <div class="assistant-chat-actions">
                  <button
                    class="ghost assistant-history-toggle"
                    type="button"
                    :disabled="assistantChatLocked"
                    @click="startAssistantNewConversation"
                  >
                    新对话
                  </button>
                  <button class="ghost assistant-history-toggle" type="button" @click="toggleAssistantHistory">
                    我的对话历史
                  </button>
                  <button type="submit" :disabled="assistantChatLocked || assistantReadOnly || !assistantInput.trim()">
                    {{ assistantChatLocked ? '处理中...' : '发送' }}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <button
            v-if="showAssistantOrb"
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
import MarkdownIt from 'markdown-it';
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
const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});
const defaultLinkOpenRule = markdownRenderer.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

markdownRenderer.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpenRule(tokens, idx, options, env, self);
};
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
const topbarTitleOverride = ref('');
const topbarBackLabel = ref('');
const assistantInput = ref('');
const assistantState = ref('idle');
const assistantSleepy = ref(false);
const assistantMessages = ref([createAssistantWelcomeMessage()]);
let assistantMessageId = 2;
let assistantThinkingTimer = null;
let assistantReplyTimer = null;
let assistantSleepTimer = null;
let assistantOrbPressTimer = null;
let assistantPanelSnapbackTimer = null;
let assistantSidebarAdjustTimer = null;
const assistantTypewriterDelayMs = 16;
let assistantRenderedMarkdownSource = '';
let assistantRenderedMarkdownHtml = '';
let assistantStreamingScrollRaf = 0;
const assistantStreamRender = reactive({
  activeMessageId: null,
  queue: [],
  started: false,
  responseReady: false,
  firstDeltaAt: 0,
  completed: false,
  finalContent: '',
  renderedMarkdownHtml: '',
  pendingText: '',
  running: false,
  completionPromise: null,
  resolveCompletion: null
});
const assistantResizeDirections = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
const assistantOrbSize = 96;
const assistantOrbDefaultOffset = { right: 38, bottom: 26 };
const assistantDefaultPanelSize = { width: 360, height: 620 };
const ASSISTANT_DOCKED_KEY = 'assistant:dockedToTopbar';
const assistantOrbPosition = reactive({ left: 0, top: 0 });
const assistantOrbReady = ref(false);
const assistantOrbDragging = ref(false);
const assistantOrbDragged = ref(false);
const assistantDockedToTopbar = ref(localStorage.getItem(ASSISTANT_DOCKED_KEY) === '1');
const assistantLaunchSource = ref(assistantDockedToTopbar.value ? 'topbar' : 'orb');
const assistantActiveConversation = ref(null);
const assistantHistoryOpen = ref(false);
const assistantHistoryMode = ref('own');
const assistantHistoryLoading = ref(false);
const assistantHistoryRows = ref([]);
const assistantHistoryError = ref('');
const assistantHistoryPage = ref(1);
const assistantHistoryPageSize = 12;
const assistantHistoryFetchBatchSize = 200;
const assistantHistoryTotal = ref(0);
const assistantHistoryContextFilter = ref('all');
const assistantSharedHistoryAvailable = ref(false);
const assistantRenameConversationId = ref(null);
const assistantRenameDraft = ref('');
const assistantAutoScrollEnabled = ref(true);
const assistantRenameInputRef = ref(null);
const assistantOwnedConversationSnapshot = ref(null);
let assistantSharedHistoryCheckToken = 0;
const assistantPanelPosition = reactive({ left: 0, top: 0 });
const assistantPanelSize = reactive({ width: assistantDefaultPanelSize.width, height: assistantDefaultPanelSize.height });
const assistantPanelReady = ref(false);
const assistantPanelSnapback = ref(false);
const assistantPanelMaximized = ref(false);
const assistantPanelRestoreState = reactive({
  left: 0,
  top: 0,
  width: assistantDefaultPanelSize.width,
  height: assistantDefaultPanelSize.height,
  valid: false
});
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
  if (topbarTitleOverride.value) return topbarTitleOverride.value;
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
  if (user.value?.user_type === 'student') {
    return `学生用户：${user.value?.grade || '高年级'}`;
  }
  if (user.value?.user_type === 'teacher') return '教师用户';
  return user.value?.user_type || '-';
});
const userTypeClass = computed(() => {
  const normalized = String(user.value?.user_type || '').trim().toLowerCase();
  return normalized ? `type-${normalized}` : 'type-unknown';
});
const showAssistantOrb = computed(() => Boolean(user.value && isUserMode.value && !assistantDockedToTopbar.value));
const showAssistantTopbarButton = computed(() => Boolean(user.value && isUserMode.value && assistantDockedToTopbar.value));
const showAssistantWidget = computed(() => Boolean(user.value && isUserMode.value && (showAssistantOrb.value || showAssistantTopbarButton.value || assistantOpen.value)));
const assistantBusy = computed(() => assistantState.value === 'thinking' || assistantState.value === 'replying');
const assistantRequestPending = ref(false);
const assistantChatLocked = computed(() => assistantBusy.value || assistantRequestPending.value);
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
const assistantInputLimit = 1000;
const assistantInputTooLong = computed(() => assistantInput.value.length > assistantInputLimit);
const assistantSuggestedQuestions = computed(() => assistantActiveConversation.value?.suggested_questions || []);
const assistantReadOnly = computed(() => Boolean(assistantActiveConversation.value?.is_read_only));
const assistantHasContext = computed(() => {
  const conversation = assistantActiveConversation.value;
  return Boolean(conversation && conversation.context_type && conversation.context_type !== 'none' && conversation.context_id);
});
const assistantCanViewSharedHistory = computed(() => assistantHasContext.value && assistantSharedHistoryAvailable.value);
const assistantHistoryTitle = computed(() => assistantHistoryMode.value === 'shared' ? '其他用户聊天历史' : '对话历史');
const assistantHistoryEmptyText = computed(() => assistantHistoryMode.value === 'shared' ? '暂无其他用户聊天历史' : '暂无对话历史');
const assistantHistoryTotalPages = computed(() => Math.max(1, Math.ceil(assistantHistoryTotal.value / assistantHistoryPageSize)));
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
const assistantChatBodyRef = ref(null);

function showToast(message, type = 'info') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  setTimeout(() => {
    toast.visible = false;
  }, 1600);
}

function guardAssistantChatLocked(message = '当前仍有对话在处理中，请等待完成后再发起新聊天') {
  if (!assistantChatLocked.value) return false;
  showToast(message, 'error');
  return true;
}

function emphasizeAssistantContextPrompt(content) {
  const text = String(content || '');
  return text
    .replace(
      /关于(单词|文法|文章)\*\*「([^」]+)」\*\*，你想问些什么？/g,
      '关于$1 **「$2」**，你想问些什么？'
    )
    .replace(
      /关于(单词|文法|文章)「([^」]+)」，你想问些什么？/g,
      '关于$1 **「$2」**，你想问些什么？'
    );
}

function normalizeAssistantMarkdown(content) {
  return String(content || '').replace(
    /(^|[\s([{"'“‘「『（【《])\*\*\s+((?:(?!\*\*).)*?\S)\s+\*\*/g,
    '$1**$2**'
  );
}

function renderAssistantMarkdown(content) {
  return markdownRenderer.render(normalizeAssistantMarkdown(emphasizeAssistantContextPrompt(content)));
}

function escapeAssistantHtml(content) {
  return String(content || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function splitStreamingMarkdown(content) {
  const text = normalizeAssistantMarkdown(emphasizeAssistantContextPrompt(content));
  if (!text) return { rendered: '', pending: '' };

  const fenceMatches = [...text.matchAll(/```/g)].map((match) => match.index ?? 0);
  let stableSearchLimit = text.length;
  if (fenceMatches.length % 2 === 1) {
    stableSearchLimit = fenceMatches[fenceMatches.length - 1];
  }

  const stableSearchText = text.slice(0, stableSearchLimit);
  if (!stableSearchText.trim()) {
    return { rendered: '', pending: text };
  }

  if (stableSearchLimit === text.length && /\n\n\s*$/.test(text)) {
    return { rendered: text, pending: '' };
  }

  const lastBlockBoundary = stableSearchText.lastIndexOf('\n\n');
  if (lastBlockBoundary === -1) {
    return { rendered: '', pending: text };
  }

  const rendered = text.slice(0, lastBlockBoundary + 2);
  const pending = text.slice(lastBlockBoundary + 2);
  return { rendered, pending };
}

function updateAssistantStreamingSegments(content) {
  const { rendered, pending } = splitStreamingMarkdown(content);

  if (rendered.trim()) {
    if (assistantRenderedMarkdownSource !== rendered) {
      assistantRenderedMarkdownSource = rendered;
      assistantRenderedMarkdownHtml = markdownRenderer.render(rendered);
    }
    assistantStreamRender.renderedMarkdownHtml = assistantRenderedMarkdownHtml;
  } else {
    assistantRenderedMarkdownSource = '';
    assistantRenderedMarkdownHtml = '';
    assistantStreamRender.renderedMarkdownHtml = '';
  }

  assistantStreamRender.pendingText = pending || '';
}

function assistantMessageDisplayContent(message) {
  return message?.displayContent ?? message?.content ?? '';
}

function renderAssistantStreamingText(content) {
  return escapeAssistantHtml(content).replace(/\n/g, '<br>');
}

function assistantStreamingRenderedHtml(message) {
  if (assistantStreamRender.activeMessageId !== message?.id) return '';
  return assistantStreamRender.renderedMarkdownHtml || '';
}

function assistantStreamingPendingText(message) {
  if (assistantStreamRender.activeMessageId !== message?.id) {
    return assistantMessageDisplayContent(message);
  }
  return assistantStreamRender.pendingText || '';
}

function assistantMessageCopyContent(message) {
  return message?.content || message?.displayContent || '';
}

function createAssistantWelcomeMessage() {
  const content = '你好呀，我是你的AI日语助手阿酱。你可以向我提问任何日语相关的问题，我会为你详细解释。';
  return {
    id: 1,
    role: 'assistant',
    content,
    displayContent: content,
    created_at: new Date().toISOString(),
    phase: 'done'
  };
}

function assistantChatIsNearBottom() {
  const element = assistantChatBodyRef.value;
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 16;
}

function handleAssistantChatScroll() {
  assistantAutoScrollEnabled.value = assistantChatIsNearBottom();
}

function scrollAssistantChatToBottom() {
  assistantAutoScrollEnabled.value = true;
  nextTick(() => {
    requestAnimationFrame(() => {
      const element = assistantChatBodyRef.value;
      if (!element) return;
      element.scrollTop = element.scrollHeight;
    });
  });
}

function mapAssistantMessage(message) {
  const content = message.content || '';
  return {
    id: message.id || `${message.role}-${Date.now()}-${Math.random()}`,
    role: message.role === 'user' ? 'user' : 'assistant',
    content,
    displayContent: content,
    created_at: message.created_at || '',
    phase: 'done'
  };
}

function assistantConversationIsProcessing(item) {
  return item?.is_processing || item?.reply_status === 'processing';
}

function appendAssistantProcessingPlaceholder(messages, conversation) {
  if (!assistantConversationIsProcessing(conversation)) return messages;
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role === 'assistant' && lastMessage.phase === 'thinking') return messages;
  if (lastMessage?.role === 'assistant' && !lastMessage.content) return messages;

  return [
    ...messages,
    {
      id: `thinking-${conversation.id}`,
      role: 'assistant',
      content: '',
      displayContent: '',
      created_at: conversation.reply_started_at || new Date().toISOString(),
      phase: 'thinking'
    }
  ];
}

function setAssistantConversation(payload) {
  const conversation = payload?.conversation || null;
  assistantActiveConversation.value = conversation;
  assistantMessages.value = appendAssistantProcessingPlaceholder((payload?.messages || []).map(mapAssistantMessage), conversation);
  const maxMessageId = assistantMessages.value.reduce((max, message) => {
    const id = Number(message.id);
    return Number.isFinite(id) ? Math.max(max, id) : max;
  }, assistantMessageId);
  assistantMessageId = maxMessageId + 1;
  assistantHistoryOpen.value = false;
  assistantState.value = assistantConversationIsProcessing(conversation) ? 'thinking' : 'idle';
}

function resetAssistantDraftConversation() {
  assistantActiveConversation.value = null;
  assistantMessages.value = [createAssistantWelcomeMessage()];
  assistantMessageId = 2;
  assistantState.value = 'idle';
  assistantInput.value = '';
}

function recalculateAssistantMessageId() {
  const maxMessageId = assistantMessages.value.reduce((max, message) => {
    const id = Number(message.id);
    return Number.isFinite(id) ? Math.max(max, id) : max;
  }, 1);
  assistantMessageId = maxMessageId + 1;
}

function captureAssistantOwnedConversationSnapshot() {
  assistantOwnedConversationSnapshot.value = {
    conversation: assistantActiveConversation.value ? { ...assistantActiveConversation.value } : null,
    messages: assistantMessages.value.map((message) => ({ ...message })),
    input: assistantInput.value
  };
}

function restoreAssistantOwnedConversationSnapshot() {
  const snapshot = assistantOwnedConversationSnapshot.value;
  assistantOwnedConversationSnapshot.value = null;
  assistantHistoryOpen.value = false;

  if (!snapshot) {
    resetAssistantDraftConversation();
    scrollAssistantChatToBottom();
    return;
  }

  assistantActiveConversation.value = snapshot.conversation ? { ...snapshot.conversation } : null;
  assistantMessages.value = snapshot.messages.map((message) => ({ ...message }));
  assistantInput.value = snapshot.input || '';
  assistantState.value = assistantConversationIsProcessing(assistantActiveConversation.value) ? 'thinking' : 'idle';
  recalculateAssistantMessageId();
  scrollAssistantChatToBottom();
}

function assistantConversationPrefix(contextType) {
  if (contextType === 'vocabulary') return '单词：';
  if (contextType === 'grammar') return '文法：';
  if (contextType === 'text') return '文章：';
  return '';
}

function assistantConversationEditableTitle(item) {
  if (assistantConversationIsProcessing(item)) return '正在思考中';
  if (!item) return '自由提问';
  const rawLabel = String(item.context_label || '').trim();
  return rawLabel || '自由提问';
}

function assistantConversationDisplayTitle(item) {
  return assistantConversationEditableTitle(item);
}

function formatAssistantTime(value) {
  return String(value || '').replace(/:\d{2}$/, '');
}

function formatAssistantMessageClock(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/(\d{2}:\d{2})(?::\d{2})?$/);
  if (match) return match[1];

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function validateAssistantInputLength() {
  if (!assistantInputTooLong.value) return true;
  showToast(`输入内容不能超过 ${assistantInputLimit} 字`, 'error');
  return false;
}

async function copyAssistantMessage(content) {
  const text = String(content || '');
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('已复制', 'success');
  } catch (error) {
    showToast('复制失败', 'error');
  }
}

function currentAssistantContextParams() {
  const conversation = assistantActiveConversation.value;
  if (!conversation?.context_type || conversation.context_type === 'none' || !conversation.context_id) {
    return null;
  }
  return {
    context_type: conversation.context_type,
    context_id: conversation.context_id
  };
}

async function ensureAssistantConversation() {
  if (assistantActiveConversation.value && !assistantReadOnly.value) return assistantActiveConversation.value;
  return createAssistantConversation();
}

async function createAssistantConversation() {
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
  const mode = assistantHistoryMode.value;
  assistantHistoryLoading.value = true;
  assistantHistoryError.value = '';
  try {
    if (mode === 'shared') {
      const contextParams = currentAssistantContextParams();
      if (!contextParams) {
        assistantHistoryRows.value = [];
        assistantHistoryTotal.value = 0;
        return;
      }
      const data = await apiRequest('/api/user/assistant/conversations/shared', {
        params: {
          ...contextParams,
          limit: assistantHistoryPageSize,
          offset: (assistantHistoryPage.value - 1) * assistantHistoryPageSize
        },
        timeout: 30000
      });
      assistantHistoryRows.value = data.rows || [];
      assistantHistoryTotal.value = Number(data.total || 0);
      return;
    }

    await loadOwnedAssistantHistory();
  } catch (err) {
    assistantHistoryError.value = err instanceof ApiError ? err.message : '加载失败';
    assistantHistoryTotal.value = 0;
  } finally {
    assistantHistoryLoading.value = false;
  }
}

function assistantHistoryMatchesContextFilter(item) {
  if (assistantHistoryContextFilter.value === 'all') return true;
  return item?.context_type === assistantHistoryContextFilter.value;
}

async function loadOwnedAssistantHistory() {
  if (assistantHistoryContextFilter.value === 'all') {
    const data = await apiRequest('/api/user/assistant/conversations', {
      params: {
        limit: assistantHistoryPageSize,
        offset: (assistantHistoryPage.value - 1) * assistantHistoryPageSize
      },
      timeout: 30000
    });
    assistantHistoryRows.value = data.rows || [];
    assistantHistoryTotal.value = Number(data.total || 0);
    return;
  }

  const rows = [];
  let offset = 0;
  let total = 0;
  do {
    const data = await apiRequest('/api/user/assistant/conversations', {
      params: {
        contextType: assistantHistoryContextFilter.value,
        limit: assistantHistoryFetchBatchSize,
        offset
      },
      timeout: 30000
    });
    const batchRows = data.rows || [];
    rows.push(...batchRows);
    total = Number(data.total || rows.length);
    offset += batchRows.length;
    if (batchRows.length < assistantHistoryFetchBatchSize) break;
  } while (offset < total);

  const filteredRows = rows.filter(assistantHistoryMatchesContextFilter);
  const pageStart = (assistantHistoryPage.value - 1) * assistantHistoryPageSize;
  assistantHistoryRows.value = filteredRows.slice(pageStart, pageStart + assistantHistoryPageSize);
  assistantHistoryTotal.value = filteredRows.length;
}

async function toggleAssistantHistory() {
  if (assistantHistoryOpen.value) {
    closeAssistantHistory();
    return;
  }
  assistantHistoryMode.value = 'own';
  assistantHistoryPage.value = 1;
  assistantHistoryContextFilter.value = 'all';
  assistantHistoryOpen.value = true;
  await loadAssistantHistory();
}

function closeAssistantHistory() {
  assistantHistoryOpen.value = false;
  cancelAssistantConversationRename();
  if (assistantHistoryMode.value === 'own') {
    scrollAssistantChatToBottom();
  }
}

function handleAssistantHistoryBack() {
  if (assistantHistoryMode.value === 'shared') {
    restoreAssistantOwnedConversationSnapshot();
    return;
  }
  closeAssistantHistory();
}

async function refreshAssistantHistoryView() {
  await loadAssistantHistory();
}

async function handleAssistantHistoryFilterChange() {
  assistantHistoryPage.value = 1;
  await loadAssistantHistory();
}

async function openAssistantSharedHistory() {
  if (!assistantCanViewSharedHistory.value) return;
  if (!assistantReadOnly.value) {
    captureAssistantOwnedConversationSnapshot();
  }
  assistantHistoryMode.value = 'shared';
  assistantHistoryPage.value = 1;
  assistantHistoryOpen.value = true;
  await loadAssistantHistory();
}

async function returnToAssistantSharedHistory() {
  await openAssistantSharedHistory();
}

async function startAssistantNewConversation() {
  if (guardAssistantChatLocked()) return;

  try {
    assistantOwnedConversationSnapshot.value = null;
    await createAssistantConversation();
    assistantHistoryRows.value = [];
    assistantHistoryError.value = '';
    assistantInput.value = '';
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : '创建新对话失败', 'error');
  }
}

function activateAssistantHistoryItem(item) {
  if (!item?.id) return;
  if (assistantHistoryMode.value === 'own' && assistantRenameConversationId.value === item.id) return;
  loadAssistantConversation(item.id);
}

async function deleteAssistantConversation(item) {
  if (!item?.id) return;
  if (guardAssistantChatLocked('当前仍有对话在处理中，请等待完成后再管理历史')) return;
  if (!window.confirm('确认删除这条对话历史？')) return;

  try {
    await apiRequest(`/api/user/assistant/conversations/${item.id}`, {
      method: 'DELETE',
      timeout: 30000
    });
  if (Number(assistantActiveConversation.value?.id) === Number(item.id)) {
    resetAssistantDraftConversation();
  }
  const nextTotal = Math.max(0, assistantHistoryTotal.value - 1);
  const nextTotalPages = Math.max(1, Math.ceil(nextTotal / assistantHistoryPageSize));
  assistantHistoryTotal.value = nextTotal;
  if (assistantHistoryPage.value > nextTotalPages) {
    assistantHistoryPage.value = nextTotalPages;
  }
  await loadAssistantHistory();
  showToast('已删除', 'success');
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : '删除失败', 'error');
  }
}

function cancelAssistantConversationRename() {
  assistantRenameConversationId.value = null;
  assistantRenameDraft.value = '';
}

function handleAssistantHistoryPointerDown(event) {
  if (!assistantRenameConversationId.value) return;
  if (event.target?.closest?.('.assistant-history-rename-input')) return;
  assistantRenameInputRef.value?.blur?.();
}

function startAssistantConversationRename(item) {
  if (!item?.id || assistantHistoryMode.value !== 'own') return;
  if (guardAssistantChatLocked('当前仍有对话在处理中，请等待完成后再管理历史')) return;
  if (assistantConversationIsProcessing(item)) {
    showToast('正在思考中的对话暂不能重命名', 'error');
    return;
  }
  assistantRenameConversationId.value = item.id;
  assistantRenameDraft.value = assistantConversationEditableTitle(item);
  nextTick(() => {
    const input = assistantRenameInputRef.value;
    if (input?.focus) {
      input.focus();
      input.select?.();
    }
  });
}

function changeAssistantHistoryPage(nextPage) {
  const normalized = Math.min(Math.max(1, Number(nextPage) || 1), assistantHistoryTotalPages.value);
  if (normalized === assistantHistoryPage.value) return;
  assistantHistoryPage.value = normalized;
  loadAssistantHistory();
}

async function submitAssistantConversationRename(item) {
  if (!item?.id || assistantRenameConversationId.value !== item.id) return;
  const title = assistantRenameDraft.value.trim();
  if (!title) {
    showToast('标题不能为空', 'error');
    return;
  }

  try {
    const data = await apiRequest(`/api/user/assistant/conversations/${item.id}/title`, {
      method: 'PATCH',
      body: { title },
      timeout: 30000
    });
    assistantHistoryRows.value = assistantHistoryRows.value.map((row) => (
      Number(row.id) === Number(item.id)
        ? {
            ...row,
            ...data.conversation,
            last_message_excerpt: data.conversation?.last_message_excerpt || row.last_message_excerpt,
            last_message_at: data.conversation?.last_message_at || row.last_message_at
          }
        : row
    ));
    if (Number(assistantActiveConversation.value?.id) === Number(item.id)) {
      assistantActiveConversation.value = {
        ...assistantActiveConversation.value,
        ...data.conversation
      };
    }
    cancelAssistantConversationRename();
    showToast('已重命名', 'success');
  } catch (err) {
    showToast(err instanceof ApiError ? err.message : '重命名失败', 'error');
  }
}

async function refreshAssistantSharedHistoryAvailability() {
  const token = ++assistantSharedHistoryCheckToken;
  const contextParams = currentAssistantContextParams();

  if (!contextParams) {
    assistantSharedHistoryAvailable.value = false;
    return;
  }

  try {
    const data = await apiRequest('/api/user/assistant/conversations/shared', {
      params: {
        ...contextParams,
        limit: 1
      },
      timeout: 30000
    });
    if (token !== assistantSharedHistoryCheckToken) return;
    assistantSharedHistoryAvailable.value = Number(data.total || 0) > 0;
  } catch (err) {
    if (token !== assistantSharedHistoryCheckToken) return;
    assistantSharedHistoryAvailable.value = false;
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

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function scheduleAssistantStreamingScroll() {
  if (!assistantAutoScrollEnabled.value) return;
  if (assistantStreamingScrollRaf) return;
  assistantStreamingScrollRaf = requestAnimationFrame(() => {
    assistantStreamingScrollRaf = 0;
    scrollAssistantStreamingToBottom();
  });
}

function resetAssistantStreamRender() {
  assistantStreamRender.activeMessageId = null;
  assistantStreamRender.queue = [];
  assistantStreamRender.started = false;
  assistantStreamRender.responseReady = false;
  assistantStreamRender.firstDeltaAt = 0;
  assistantStreamRender.completed = false;
  assistantStreamRender.finalContent = '';
  assistantStreamRender.renderedMarkdownHtml = '';
  assistantStreamRender.pendingText = '';
  assistantRenderedMarkdownSource = '';
  assistantRenderedMarkdownHtml = '';
  if (assistantStreamingScrollRaf) {
    cancelAnimationFrame(assistantStreamingScrollRaf);
    assistantStreamingScrollRaf = 0;
  }
  assistantStreamRender.running = false;
  assistantStreamRender.completionPromise = null;
  assistantStreamRender.resolveCompletion = null;
}

function ensureAssistantRenderTarget(message) {
  if (assistantStreamRender.activeMessageId === message.id) return;
  resetAssistantStreamRender();
  assistantStreamRender.activeMessageId = message.id;
  assistantStreamRender.completionPromise = new Promise((resolve) => {
    assistantStreamRender.resolveCompletion = resolve;
  });
}

function scrollAssistantStreamingToBottom() {
  const element = assistantChatBodyRef.value;
  if (!element) return;
  element.scrollTop = element.scrollHeight;
}

async function runAssistantRenderLoop(message) {
  if (assistantStreamRender.running) {
    if (assistantStreamRender.completionPromise) {
      await assistantStreamRender.completionPromise;
    }
    return;
  }
  assistantStreamRender.running = true;
  const finalContent = assistantStreamRender.finalContent || assistantMessageCopyContent(message);
  const chars = Array.from(finalContent);

  message.content = '';
  message.displayContent = '';

  if (!chars.length) {
    message.phase = 'done';
    assistantState.value = 'idle';
    const resolve = assistantStreamRender.resolveCompletion;
    resetAssistantStreamRender();
    resolve?.();
    return;
  }

  message.displayContent = chars.shift();
  updateAssistantStreamingSegments(message.displayContent);
  message.phase = 'replying';
  assistantState.value = 'replying';
  scheduleAssistantStreamingScroll();

  while (assistantStreamRender.activeMessageId === message.id && chars.length) {
    await sleep(assistantTypewriterDelayMs);
    message.displayContent = `${message.displayContent || ''}${chars.shift()}`;
    updateAssistantStreamingSegments(message.displayContent);
    scheduleAssistantStreamingScroll();
  }

  if (assistantStreamRender.activeMessageId !== message.id) {
    const resolve = assistantStreamRender.resolveCompletion;
    resetAssistantStreamRender();
    resolve?.();
    return;
  }

  message.content = finalContent;
  message.displayContent = finalContent;
  message.phase = 'done';
  assistantState.value = 'idle';
  const resolve = assistantStreamRender.resolveCompletion;
  resetAssistantStreamRender();
  resolve?.();
}

function enqueueAssistantDelta(message, content) {
  if (!content) return;
  ensureAssistantRenderTarget(message);
  if (!assistantStreamRender.firstDeltaAt) {
    assistantStreamRender.firstDeltaAt = Date.now();
  }
  assistantStreamRender.queue.push(...Array.from(String(content)));
}

async function finalizeAssistantRender(message, finalContent, receivedDelta) {
  ensureAssistantRenderTarget(message);
  const streamedContent = assistantStreamRender.queue.join('');
  const normalizedFinalContent = finalContent || streamedContent || assistantMessageCopyContent(message) || '';
  assistantStreamRender.queue = [];
  assistantStreamRender.finalContent = normalizedFinalContent;
  assistantStreamRender.completed = true;
  assistantStreamRender.responseReady = true;

  void runAssistantRenderLoop(message);
  if (assistantStreamRender.completionPromise) {
    await assistantStreamRender.completionPromise;
  }
}

function abortAssistantRender(message, fallbackContent = '') {
  if (assistantStreamRender.activeMessageId === message?.id) {
    const resolve = assistantStreamRender.resolveCompletion;
    resetAssistantStreamRender();
    resolve?.();
  }
  if (assistantReplyTimer) {
    clearInterval(assistantReplyTimer);
    assistantReplyTimer = null;
  }
  if (message) {
    message.phase = 'done';
    message.content = fallbackContent;
    message.displayContent = fallbackContent;
  }
  assistantState.value = 'idle';
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

  function isActiveStreamConversation() {
    return Number(assistantActiveConversation.value?.id) === Number(conversationId);
  }

  function isVisibleReplyMessage() {
    return assistantMessages.value.includes(replyMessage);
  }

  async function processBlock(block) {
    if (!block.trim()) return;
    const payload = parseSseBlock(block);
    if (payload.event === 'delta' && payload.data?.content) {
      if (!isActiveStreamConversation() || !isVisibleReplyMessage()) return;
      if (!receivedDelta) {
        receivedDelta = true;
      }
      enqueueAssistantDelta(replyMessage, payload.data.content);
      return;
    }

    if (payload.event === 'done') {
      if (!isActiveStreamConversation()) return;
      if (!isVisibleReplyMessage()) {
        await loadAssistantConversation(conversationId);
        return;
      }
      if (payload.data?.conversation) {
        assistantActiveConversation.value = payload.data.conversation;
      }
      if (payload.data?.message?.created_at) {
        replyMessage.created_at = payload.data.message.created_at;
      }
      const serverMessageId = payload.data?.message?.id;
      const finalContent = payload.data?.message?.content || assistantMessageCopyContent(replyMessage);
      await finalizeAssistantRender(replyMessage, finalContent, receivedDelta);
      if (serverMessageId) {
        replyMessage.id = serverMessageId;
      }
      return;
    }

    if (payload.event === 'ping') return;

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
    if (!isActiveStreamConversation() || !isVisibleReplyMessage()) return;
    await finalizeAssistantRender(replyMessage, assistantMessageCopyContent(replyMessage), receivedDelta);
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

function handleTopbarTitleOverride(event) {
  topbarTitleOverride.value = String(event.detail?.title || '').trim();
  topbarBackLabel.value = String(event.detail?.backLabel || '').trim();
}

function handleTopbarBackClick() {
  window.dispatchEvent(new CustomEvent('topbar:back'));
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

function assistantTopbarPanelPlacement() {
  const metrics = assistantContentMetrics();
  return {
    left: Math.max(12, metrics.width - assistantDefaultPanelSize.width - 18),
    top: 12
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

function assistantMaximizedPlacement() {
  const margin = 12;
  const metrics = assistantContentMetrics();
  return {
    left: margin,
    top: margin,
    width: Math.max(320, metrics.width - margin * 2),
    height: Math.max(360, metrics.height - margin * 2)
  };
}

function applyAssistantMaximizedPlacement() {
  const target = assistantMaximizedPlacement();
  assistantPanelReady.value = true;
  assistantPanelPosition.left = target.left;
  assistantPanelPosition.top = target.top;
  assistantPanelSize.width = target.width;
  assistantPanelSize.height = target.height;
}

function handleAssistantPanelBoundsChange() {
  if (assistantPanelMaximized.value) {
    applyAssistantMaximizedPlacement();
    return;
  }
  clampAssistantPanel();
}

function ensureAssistantPanelPosition() {
  if (assistantPanelReady.value) {
    handleAssistantPanelBoundsChange();
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
  assistantPanelMaximized.value = false;
  assistantPanelRestoreState.valid = false;
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
    handleAssistantPanelBoundsChange();
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
  resetAssistantStreamRender();
  clearAssistantSleepTimer();
  clearAssistantOrbPressTimer();
  clearAssistantPanelSnapbackTimer();
  clearAssistantSidebarAdjustTimer();
}

async function openAssistant() {
  if (showAssistantOrb.value) ensureAssistantOrbPosition();
  clearAssistantPanelSnapbackTimer();
  assistantPanelSnapback.value = false;
  assistantPanelMaximized.value = false;
  assistantPanelRestoreState.valid = false;
  assistantPanelSize.width = assistantDefaultPanelSize.width;
  assistantPanelSize.height = assistantDefaultPanelSize.height;
  assistantPanelReady.value = true;

  const desired = assistantLaunchSource.value === 'topbar'
    ? assistantTopbarPanelPlacement()
    : (assistantOrbDragged.value ? assistantPanelPlacementFromOrb() : assistantDefaultPanelPlacement());
  assistantPanelPosition.left = desired.left;
  assistantPanelPosition.top = desired.top;
  assistantOpen.value = true;

  await nextTick();

  if (
    assistantLaunchSource.value === 'topbar' ||
    !assistantOrbDragged.value ||
    assistantPlacementIsValid(desired.left, desired.top, assistantPanelSize.width, assistantPanelSize.height)
  ) {
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

async function openAssistantFromOrb() {
  assistantLaunchSource.value = 'orb';
  assistantOwnedConversationSnapshot.value = null;
  assistantHistoryOpen.value = false;
  assistantHistoryRows.value = [];
  assistantHistoryError.value = '';
  resetAssistantDraftConversation();
  await openAssistant();
}

async function openAssistantFromTopbar() {
  assistantLaunchSource.value = 'topbar';
  assistantOwnedConversationSnapshot.value = null;
  assistantHistoryOpen.value = false;
  assistantHistoryRows.value = [];
  assistantHistoryError.value = '';
  resetAssistantDraftConversation();
  assistantHover.value = false;
  await openAssistant();
}

function closeAssistant() {
  assistantOpen.value = false;
  assistantHistoryOpen.value = false;
  assistantLaunchSource.value = assistantDockedToTopbar.value ? 'topbar' : 'orb';
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

function transitionAssistantPanelTo(applyChange) {
  clearAssistantPanelSnapbackTimer();
  assistantPanelSnapback.value = true;
  requestAnimationFrame(() => {
    applyChange();
    assistantPanelSnapbackTimer = setTimeout(() => {
      assistantPanelSnapback.value = false;
      assistantPanelSnapbackTimer = null;
    }, 320);
  });
}

function toggleAssistantPanelMaximize(event) {
  if (event?.target?.closest?.('button')) return;
  stopAssistantInteraction();

  if (assistantPanelMaximized.value) {
    transitionAssistantPanelTo(() => {
      const fallback = assistantDefaultPanelPlacement();
      assistantPanelPosition.left = assistantPanelRestoreState.valid ? assistantPanelRestoreState.left : fallback.left;
      assistantPanelPosition.top = assistantPanelRestoreState.valid ? assistantPanelRestoreState.top : fallback.top;
      assistantPanelSize.width = assistantPanelRestoreState.valid ? assistantPanelRestoreState.width : assistantDefaultPanelSize.width;
      assistantPanelSize.height = assistantPanelRestoreState.valid ? assistantPanelRestoreState.height : assistantDefaultPanelSize.height;
      assistantPanelMaximized.value = false;
      assistantPanelRestoreState.valid = false;
      clampAssistantPanel();
    });
    return;
  }

  assistantPanelRestoreState.left = assistantPanelPosition.left;
  assistantPanelRestoreState.top = assistantPanelPosition.top;
  assistantPanelRestoreState.width = assistantPanelSize.width;
  assistantPanelRestoreState.height = assistantPanelSize.height;
  assistantPanelRestoreState.valid = true;

  transitionAssistantPanelTo(() => {
    assistantPanelMaximized.value = true;
    applyAssistantMaximizedPlacement();
  });
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
    openAssistantFromOrb();
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

  if (assistantPanelMaximized.value && Math.hypot(dx, dy) > 2) {
    assistantPanelMaximized.value = false;
    assistantPanelRestoreState.valid = false;
  }

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
  if (!question || assistantChatLocked.value) return;
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
    displayContent: question,
    created_at: new Date().toISOString(),
    phase: 'done'
  };
  const replyMessage = {
    id: assistantMessageId++,
    role: 'assistant',
    content: '',
    displayContent: '',
    created_at: new Date().toISOString(),
    phase: 'thinking'
  };

  assistantMessages.value.push(userMessage, replyMessage);
  assistantInput.value = '';
  assistantOpen.value = true;
  assistantState.value = 'thinking';
  scrollAssistantChatToBottom();
  clearAssistantSleepTimer();
  resetAssistantStreamRender();
  assistantRequestPending.value = true;

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
    window.dispatchEvent(new CustomEvent('assistant:conversation-updated', {
      detail: { conversation: assistantActiveConversation.value || conversation }
    }));
  } catch (err) {
    if (Number(assistantActiveConversation.value?.id) === Number(conversation.id) && assistantMessages.value.includes(replyMessage)) {
      abortAssistantRender(replyMessage, err instanceof ApiError ? err.message : 'AI 回复失败，请稍后重试');
      showToast(assistantMessageCopyContent(replyMessage), 'error');
    } else {
      showToast(err instanceof ApiError ? err.message : 'AI 回复失败，请稍后重试', 'error');
    }
  } finally {
    assistantRequestPending.value = false;
  }
}

function submitAssistantMessage() {
  if (!validateAssistantInputLength()) return;
  sendAssistantMessage({ content: assistantInput.value });
}

function handleAssistantComposerKeydown(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  submitAssistantMessage();
}

function sendAssistantQuickQuestion(question) {
  sendAssistantMessage({
    content: question?.message || question?.label,
    templateKey: question?.template_key,
    forceWebSearch: question?.force_web_search
  });
}

async function openAssistantContext(contextType, id) {
  if (!isUserMode.value) return;
  if (!id || assistantChatLocked.value) {
    showToast(assistantChatLocked.value ? '当前仍有对话在处理中' : '条目信息无效', 'error');
    return;
  }

  try {
    assistantLaunchSource.value = assistantDockedToTopbar.value ? 'topbar' : 'orb';
    assistantOwnedConversationSnapshot.value = null;
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

async function handleAssistantOpenConversationEvent(event) {
  const conversationId = event?.detail?.id;
  if (!isUserMode.value || !conversationId) return;
  assistantLaunchSource.value = assistantDockedToTopbar.value ? 'topbar' : 'orb';
  assistantOwnedConversationSnapshot.value = null;
  assistantHistoryOpen.value = false;
  assistantHistoryRows.value = [];
  assistantHistoryError.value = '';
  await openAssistant();
  await loadAssistantConversation(conversationId);
}

function handleAssistantContextEvent(event) {
  assistantLaunchSource.value = assistantDockedToTopbar.value ? 'topbar' : 'orb';
  const detail = event?.detail || {};
  if (detail.contextType === 'vocabulary') {
    openAssistantContext('vocabulary', detail.id);
    return;
  }
  if (detail.contextType === 'grammar') {
    openAssistantContext('grammar', detail.id);
  }
}

function handleAssistantDockingChange(event) {
  const nextValue = Boolean(event?.detail?.dockedToTopbar);
  assistantDockedToTopbar.value = nextValue;
  localStorage.setItem(ASSISTANT_DOCKED_KEY, nextValue ? '1' : '0');
  if (!nextValue) ensureAssistantOrbPosition();
  if (!assistantOpen.value) {
    assistantLaunchSource.value = nextValue ? 'topbar' : 'orb';
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
  window.addEventListener('resize', handleAssistantPanelBoundsChange);
  window.addEventListener('resize', clampAssistantOrb);
  window.addEventListener('assistant:context', handleAssistantContextEvent);
  window.addEventListener('assistant:open-conversation', handleAssistantOpenConversationEvent);
  window.addEventListener('assistant:docking-changed', handleAssistantDockingChange);
  window.addEventListener('topbar:title-override', handleTopbarTitleOverride);
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

watch(
  () => [assistantActiveConversation.value?.context_type, assistantActiveConversation.value?.context_id, assistantActiveConversation.value?.id],
  () => {
    refreshAssistantSharedHistoryAvailability();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearAssistantTimers();
  stopAssistantInteraction();
  cancelAssistantOrbPress();
  window.removeEventListener('resize', handleAssistantPanelBoundsChange);
  window.removeEventListener('resize', clampAssistantOrb);
  window.removeEventListener('assistant:context', handleAssistantContextEvent);
  window.removeEventListener('assistant:open-conversation', handleAssistantOpenConversationEvent);
  window.removeEventListener('assistant:docking-changed', handleAssistantDockingChange);
  window.removeEventListener('topbar:title-override', handleTopbarTitleOverride);
});
</script>
