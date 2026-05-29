<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <span>総日ナビ</span>
      </div>
      <nav>
        <RouterLink to="/" end>仪表盘</RouterLink>
        <RouterLink v-if="isUserMode" to="/course-study">课程学习</RouterLink>
        <RouterLink v-if="isUserMode" to="/word-study">单词学习</RouterLink>
        <RouterLink v-if="isUserMode" to="/grammar-study">文法学习</RouterLink>
        <RouterLink v-if="isUserMode" to="/text-study">课文学习</RouterLink>
        <RouterLink v-if="isUserMode" to="/translation-practice">翻译练习</RouterLink>
        <RouterLink v-if="isUserMode" to="/reading-materials">阅读材料</RouterLink>
        <RouterLink v-if="isPrivileged" to="/users">用户管理</RouterLink>
        <RouterLink v-if="isPrivileged" to="/vocabulary">词库管理</RouterLink>
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
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth';
import { apiRequest, ApiError } from '../utils/apiClient';

const route = useRoute();
const router = useRouter();
const { state, logout, isDev, isPrivileged, isUserMode } = useAuth();
const feedbackOpen = ref(false);
const feedbackSaving = ref(false);
const feedbackError = ref('');
const feedbackTypes = ['内容错误', '页面交互', '新功能请求', '其他'];
const feedbackForm = reactive({
  feedback_type: '',
  content: ''
});
const toast = reactive({ visible: false, message: '', type: 'info' });

const titles = {
  Dashboard: '仪表盘',
  Users: '用户管理',
  Vocabulary: '词库管理',
  Feedback: '反馈处理',
  DatabaseManagement: '数据库管理',
  CourseStudy: '课程学习',
  WordStudy: '单词学习',
  GrammarStudy: '文法学习',
  TextStudy: '课文学习',
  TranslationPractice: '翻译练习',
  ReadingMaterials: '阅读材料'
};

const user = computed(() => state.user);
const title = computed(() => {
  if (route.name === 'Dashboard' && !isPrivileged.value) return '欢迎页';
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
  logout();
  router.push({ name: 'Login' });
}
</script>
