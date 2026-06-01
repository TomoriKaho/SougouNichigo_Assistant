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
        <RouterLink v-if="isUserMode" to="/course-study">课程学习</RouterLink>
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
      <main class="content">
        <router-view />
        <div
          v-if="showAssistantOrb"
          class="assistant-widget"
          :class="{ 'is-open': assistantOpen }"
          @mouseenter="assistantHover = true"
          @mouseleave="assistantHover = false"
        >
          <div v-if="assistantHover && !assistantOpen" class="assistant-hint-bubble" aria-hidden="true">
            点我就可以开始提问啦～
          </div>

          <div v-if="assistantOpen" class="assistant-chat-panel" role="dialog" aria-label="AI 助手">
            <div class="assistant-chat-header">
              <div class="assistant-chat-title-group">
                <img class="assistant-chat-avatar" :src="assistantCurrentImage" alt="" />
                <div>
                  <h3>AI 助手</h3>
                  <p>{{ assistantStatusText }}</p>
                </div>
              </div>
              <button class="ghost assistant-close-button" type="button" @click="closeAssistant">关闭</button>
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
                :disabled="assistantBusy"
                placeholder="输入你想问的问题..."
              ></textarea>
              <div class="assistant-chat-actions">
                <button type="submit" :disabled="assistantBusy || !assistantInput.trim()">
                  {{ assistantBusy ? '处理中...' : '发送' }}
                </button>
              </div>
            </form>
          </div>

          <button class="assistant-orb" type="button" aria-label="打开 AI 助手" @click="openAssistant">
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
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import assistantHappyImage from '../assistant/assistant-happy.webp';
import assistantNormalImage from '../assistant/assistant-normal.webp';
import assistantReplyingImage from '../assistant/assistant-replying.webp';
import assistantSleepyImage from '../assistant/assistant-sleepy.webp';
import assistantThinkingImage from '../assistant/assistant-thinking.webp';
import { useAuth } from '../composables/useAuth';
import { apiRequest, ApiError } from '../utils/apiClient';

const route = useRoute();
const router = useRouter();
const { state, logout, isDev, isPrivileged, isUserMode, isTeacher } = useAuth();
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
    content: '你好呀，我已经准备好啦。你可以直接点我提问。',
    phase: 'done'
  }
]);
let assistantMessageId = 2;
let assistantThinkingTimer = null;
let assistantReplyTimer = null;
let assistantSleepTimer = null;
const assistantReplySamples = [
  '这个问题我已经记下来了。当前回复还是占位内容，后面可以把它接到真正的 AI 服务上，再根据你的学习页面上下文给出更贴切的回答。',
  '我现在先用一段模拟回复和你对话。等后续接入真实模型后，这里可以继续扩展成结合词库、文法、课程资料和班级内容的智能问答。',
  '这是本地模拟的流式回复效果。后续如果要做正式版本，建议把页面上下文、当前教材和用户身份一起带给模型，这样回答会更有用。'
];

const titles = {
  Dashboard: '首页',
  Users: '用户管理',
  Vocabulary: '词库管理',
  Grammar: '文法管理',
  Texts: '课文管理',
  Feedback: '反馈处理',
  DatabaseManagement: '数据库管理',
  CourseStudy: '课程学习',
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
  return '点我就可以开始提问';
});

function showToast(message, type = 'info') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  setTimeout(() => {
    toast.visible = false;
  }, 3000);
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
  sidebarCollapsed.value = !sidebarCollapsed.value;
}

function clearAssistantSleepTimer() {
  if (assistantSleepTimer) {
    clearTimeout(assistantSleepTimer);
    assistantSleepTimer = null;
  }
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
  }, 120000);
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
}

function openAssistant() {
  assistantOpen.value = true;
}

function closeAssistant() {
  assistantOpen.value = false;
}

function submitAssistantMessage() {
  const question = assistantInput.value.trim();
  if (!question || assistantBusy.value) return;

  assistantMessages.value.push({
    id: assistantMessageId++,
    role: 'user',
    content: question,
    phase: 'done'
  });
  assistantInput.value = '';
  assistantOpen.value = true;

  const replyMessage = {
    id: assistantMessageId++,
    role: 'assistant',
    content: '',
    phase: 'thinking'
  };
  assistantMessages.value.push(replyMessage);
  assistantState.value = 'thinking';
  clearAssistantTimers();

  assistantThinkingTimer = setTimeout(() => {
    const replySource = assistantReplySamples[Math.floor(Math.random() * assistantReplySamples.length)];
    let pointer = 0;
    replyMessage.phase = 'replying';
    assistantState.value = 'replying';

    assistantReplyTimer = setInterval(() => {
      const nextChunk = replySource.slice(pointer, pointer + 2);
      replyMessage.content += nextChunk;
      pointer += 2;

      if (pointer >= replySource.length) {
        clearAssistantTimers();
        replyMessage.phase = 'done';
        assistantState.value = 'idle';
      }
    }, 45);
  }, 3000);
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

onBeforeUnmount(() => {
  clearAssistantTimers();
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
</script>
