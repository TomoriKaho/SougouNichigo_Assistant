<template>
  <div class="dashboard-page">
    <div v-if="isPrivileged" class="dashboard-top-row">
      <section class="card dashboard-welcome-card">
        <h2 class="dashboard-welcome-text">{{ welcomeText }}</h2>
        <p class="dashboard-welcome-subtext">
          {{ welcomeSubtext }}
        </p>
      </section>

      <section class="card dashboard-summary-card">
        <h3 class="dashboard-summary-title">管理总览</h3>
        <div class="dashboard-summary-list">
          <button
            v-for="item in statCards"
            :key="item.key"
            class="summary-item"
            type="button"
            @click="goTo(item.routeName)"
          >
            <span class="summary-main">
              <span class="summary-icon" :class="`icon-${item.key}`" aria-hidden="true">
                <svg v-if="item.key === 'users'" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="3.2" />
                  <path d="M5.5 18.4c0-2.7 2.9-4.9 6.5-4.9s6.5 2.2 6.5 4.9" />
                </svg>
                <svg v-else-if="item.key === 'vocabulary'" viewBox="0 0 24 24" fill="none">
                  <path d="M5.5 4.5h10a2 2 0 0 1 2 2v12.8a.2.2 0 0 1-.32.15L13.2 16.5a2 2 0 0 0-2.4 0l-3.98 2.95a.2.2 0 0 1-.32-.15V6.5a2 2 0 0 1 2-2z" />
                  <path d="M9 8.5h6M9 11.5h6" />
                </svg>
                <svg v-else-if="item.key === 'grammar'" viewBox="0 0 24 24" fill="none">
                  <path d="M5 5.5h14" />
                  <path d="M7.5 5.5v13" />
                  <path d="M16.5 5.5v13" />
                  <path d="M5 18.5h14" />
                  <path d="M9.5 11.5h5" />
                </svg>
                <svg v-else-if="item.key === 'text'" viewBox="0 0 24 24" fill="none">
                  <path d="M6 4.8h9.5L18 7.3v11.9H6z" />
                  <path d="M15.5 4.8v3h3" />
                  <path d="M8.8 11h6.4M8.8 14h6.4M8.8 17h4.4" />
                </svg>
                <svg v-else-if="item.key === 'readingMaterials'" viewBox="0 0 24 24" fill="none">
                  <path d="M5.5 5.5h13v13h-13z" />
                  <path d="M8 8.5h8M8 11.5h8M8 14.5h5" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M8 12h8M12 8v8" />
                </svg>
              </span>
              <span class="summary-text">{{ item.label }}：{{ item.value }}</span>
            </span>
            <span class="summary-arrow" aria-hidden="true">›</span>
          </button>
        </div>
      </section>
    </div>

    <div v-else class="dashboard-user-sections">
      <div class="dashboard-user-row dashboard-user-row-top">
        <section class="card dashboard-welcome-card dashboard-user-panel">
          <h2 class="dashboard-welcome-text">{{ welcomeText }}</h2>
          <p class="dashboard-welcome-subtext">
            {{ welcomeSubtext }}
          </p>
        </section>

        <section class="card dashboard-user-panel dashboard-classes-panel">
          <div class="dashboard-panel-header">
            <h3 class="dashboard-summary-title">进入班级</h3>
            <button class="ghost dashboard-panel-link" type="button" @click="goTo('Classes')">查看全部</button>
          </div>
          <div v-if="classesLoading" class="dashboard-panel-empty">班级加载中...</div>
          <div v-else-if="classRows.length" class="dashboard-class-list">
            <button
              v-for="item in classRows"
              :key="item.id"
              class="dashboard-class-item dashboard-setting-item"
              type="button"
              @click="enterClass(item)"
            >
              <span class="dashboard-class-name" :title="item.name">{{ item.name }}</span>
              <span class="dashboard-setting-arrow">›</span>
            </button>
          </div>
          <div v-else class="dashboard-panel-empty">
            {{ isTeacher ? '还没有可进入的班级。' : '还没有加入任何班级。' }}
          </div>
        </section>
      </div>

      <div class="dashboard-user-row dashboard-user-row-bottom">
        <section class="card dashboard-user-panel dashboard-settings-panel">
          <div class="dashboard-panel-header">
            <h3 class="dashboard-summary-title">设置</h3>
          </div>
          <div class="dashboard-settings-list">
            <button class="dashboard-setting-item" type="button" @click="notifyPending('界面语言设置')">
              <span>界面语言设置</span>
              <span class="dashboard-setting-arrow">›</span>
            </button>
            <button class="dashboard-setting-item" type="button" @click="openAccountSettings">
              <span>账号设置</span>
              <span class="dashboard-setting-arrow">›</span>
            </button>
            <button v-if="!isTeacher" class="dashboard-setting-item" type="button" @click="openGradeSettings">
              <span>年级设置</span>
              <span class="dashboard-setting-arrow">›</span>
            </button>
            <button
              class="dashboard-setting-item"
              type="button"
              :aria-pressed="assistantDockedToTopbar ? 'true' : 'false'"
              @click="toggleAssistantDocking"
            >
              <span>将AI助手收起至状态栏</span>
              <span class="dashboard-setting-switch" :class="{ active: assistantDockedToTopbar }" aria-hidden="true"></span>
            </button>
            <button
              class="dashboard-setting-item"
              type="button"
              :aria-pressed="sharedChatEnabled ? 'true' : 'false'"
              @click="toggleSharedChat"
            >
              <span class="dashboard-setting-label-with-help">
                <span>加入共享聊天</span>
                <span class="filter-help-tooltip">
                  <span class="filter-help-badge">?</span>
                  <span class="filter-help-tooltip-bubble">
                    开启时，针对单词、文法等条目的AI助手提问将会共享至其他同学
                  </span>
                </span>
              </span>
              <span class="dashboard-setting-switch" :class="{ active: sharedChatEnabled }" aria-hidden="true"></span>
            </button>
            <button class="dashboard-setting-item" type="button" @click="notifyPending('界面主题')">
              <span>界面主题</span>
              <span class="dashboard-setting-arrow">›</span>
            </button>
          </div>
        </section>

        <section class="card dashboard-user-panel dashboard-history-panel">
          <div class="dashboard-panel-header">
            <h3 class="dashboard-summary-title">AI助手对话历史</h3>
            <div v-if="historyTotalPages > 1" class="dashboard-history-pagination">
              <button class="ghost" type="button" :disabled="historyPage === 1 || historyLoading" @click="changeHistoryPage(historyPage - 1)">上一页</button>
              <span class="muted">第 {{ historyPage }} / {{ historyTotalPages }} 页</span>
              <button class="ghost" type="button" :disabled="historyPage === historyTotalPages || historyLoading" @click="changeHistoryPage(historyPage + 1)">下一页</button>
            </div>
          </div>
          <div v-if="historyLoading" class="dashboard-panel-empty">历史加载中...</div>
          <div v-else-if="historyRows.length" class="dashboard-history-list">
            <div
              v-for="item in historyRows"
              :key="item.id"
              class="dashboard-history-row"
            >
              <button
                class="assistant-history-item-main dashboard-history-item"
                type="button"
                @click="openAssistantConversation(item)"
              >
                <div class="assistant-history-item-header dashboard-history-item-header">
                  <span :title="assistantConversationDisplayTitle(item)">{{ assistantConversationDisplayTitle(item) }}</span>
                  <small>{{ formatHistoryTime(item.last_message_at || item.updated_at || item.created_at) }}</small>
                </div>
                <em>{{ item.last_message_excerpt || '暂无对话内容' }}</em>
              </button>
              <div class="dashboard-history-actions">
                <button class="ghost dashboard-history-rename" type="button" @click="confirmRenameHistory(item)">重命名</button>
                <button class="danger dashboard-history-delete" type="button" @click="confirmDeleteHistory(item)">删除</button>
              </div>
            </div>
          </div>
          <div v-else class="dashboard-panel-empty">还没有对话历史。</div>
        </section>
      </div>
    </div>

    <div v-if="!isPrivileged" class="dashboard-user-footer">
      <div class="dashboard-user-footer-links">
        <a
          class="dashboard-user-link"
          href="https://tomorikaho.github.io/SounichiNavi/"
          target="_blank"
          rel="noreferrer"
        >
          查看文档
        </a>
        <button class="dashboard-user-link" type="button" @click="openContact">联系开发者</button>
        <a
          class="dashboard-user-link"
          href="https://github.com/TomoriKaho/SounichiNavi"
          target="_blank"
          rel="noreferrer"
        >
          参与开发
        </a>
      </div>
      <p class="dashboard-user-disclaimer">
        本站资源仅供学习与交流使用，请勿用于任何商业用途；如有侵权或不当内容，请联系开发者处理。
      </p>
    </div>

    <div v-if="contactOpen" class="overlay">
      <div class="modal dashboard-contact-modal">
        <div class="modal-header">
          <h3>联系方式</h3>
          <button class="icon-close-button" type="button" aria-label="关闭联系方式弹窗" @click="closeContact">×</button>
        </div>
        <div class="dashboard-contact-body">
          <p>邮箱：2300018314@stu.pku.edu.cn</p>
          <p>微信&电话：15651466403</p>
        </div>
      </div>
    </div>

    <div v-if="deleteHistoryDialog" class="overlay">
      <div class="modal warning classroom-modal">
        <div class="modal-header">
          <h3>确认删除对话</h3>
          <button class="ghost" type="button" @click="closeDeleteHistoryDialog">关闭</button>
        </div>
        <p>即将删除对话：<strong>{{ assistantConversationDisplayTitle(deleteHistoryDialog) }}</strong></p>
        <p class="muted">删除后该条对话历史不可恢复。</p>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeDeleteHistoryDialog">取消</button>
          <button class="danger" type="button" :disabled="historyDeleting" @click="submitDeleteHistory">
            {{ historyDeleting ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="renameHistoryDialog" class="overlay">
      <div class="modal classroom-modal">
        <div class="modal-header">
          <h3>重命名对话</h3>
          <button class="ghost" type="button" @click="closeRenameHistoryDialog">关闭</button>
        </div>
        <label class="field">
          <span>标题</span>
          <input
            v-model.trim="renameHistoryDraft"
            type="text"
            maxlength="24"
            placeholder="请输入对话标题"
            @keydown.enter.prevent="submitRenameHistory"
          />
        </label>
        <p class="muted">标题不能为空</p>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeRenameHistoryDialog">取消</button>
          <button class="danger" type="button" :disabled="historyRenaming" @click="submitRenameHistory">
            {{ historyRenaming ? '保存中...' : '确认修改' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="accountDialogOpen" class="overlay">
      <div class="modal classroom-modal">
        <div class="modal-header">
          <h3>账号设置</h3>
          <button class="ghost" type="button" @click="closeAccountSettings">关闭</button>
        </div>
        <label class="field">
          <span>用户名</span>
          <input
            v-model.trim="accountForm.username"
            type="text"
            maxlength="15"
            placeholder="请输入2-15个文字"
          />
          <span class="field-hint">在班级内展示的姓名，建议使用真实姓名作为用户名。</span>
        </label>
        <label class="field">
          <span>新密码</span>
          <input
            v-model="accountForm.password"
            type="password"
            maxlength="20"
            placeholder="留空则不修改密码"
          />
          <span class="field-hint">8-20位，需包含字母、数字、特殊符号中的至少两种。</span>
        </label>
        <label class="field">
          <span>确认密码</span>
          <input
            v-model="accountForm.confirmPassword"
            type="password"
            maxlength="20"
            placeholder="请再次输入新密码"
            @keydown.enter.prevent="submitAccountSettings"
          />
        </label>
        <p v-if="accountError" class="error">{{ accountError }}</p>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeAccountSettings">取消</button>
          <button type="button" :disabled="accountSaving" @click="submitAccountSettings">
            {{ accountSaving ? '保存中...' : '保存修改' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="gradeDialogOpen" class="overlay">
      <div class="modal classroom-modal">
        <div class="modal-header">
          <h3>年级设置</h3>
          <button class="ghost" type="button" @click="closeGradeSettings">关闭</button>
        </div>
        <label class="field">
          <span>当前年级</span>
          <select v-model="gradeForm.grade">
            <option v-for="grade in studentGradeOptions" :key="grade" :value="grade">{{ grade }}</option>
          </select>
        </label>
        <p v-if="gradeError" class="error">{{ gradeError }}</p>
        <div class="modal-actions">
          <button class="ghost" type="button" @click="closeGradeSettings">取消</button>
          <button type="button" :disabled="gradeSaving" @click="submitGradeSettings">
            {{ gradeSaving ? '保存中...' : '保存修改' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest } from '../utils/apiClient';
import { useAuth } from '../composables/useAuth';

const USERNAME_PATTERN = /^[\p{L}\p{N}]{2,15}$/u;
const USERNAME_MESSAGE = '用户名需为2-15个字符，仅支持各语言文字';
const studentGradeOptions = ['大一上', '大一下', '大二上', '大二下', '高年级'];
const ASSISTANT_DOCKED_KEY = 'assistant:dockedToTopbar';

const router = useRouter();
const { state, isPrivileged, isTeacher } = useAuth();
const stats = ref(null);
const classRows = ref([]);
const classesLoading = ref(false);
const historyRows = ref([]);
const historyLoading = ref(false);
const historyDeleting = ref(false);
const historyRenaming = ref(false);
const historyPage = ref(1);
const historyPageSize = 10;
const historyTotal = ref(0);
const deleteHistoryDialog = ref(null);
const renameHistoryDialog = ref(null);
const renameHistoryDraft = ref('');
const accountDialogOpen = ref(false);
const accountSaving = ref(false);
const accountError = ref('');
const accountForm = reactive({
  username: '',
  password: '',
  confirmPassword: ''
});
const gradeDialogOpen = ref(false);
const gradeSaving = ref(false);
const gradeError = ref('');
const gradeForm = reactive({
  grade: '高年级'
});
const assistantDockedToTopbar = ref(localStorage.getItem(ASSISTANT_DOCKED_KEY) === '1');
const contactOpen = ref(false);
const toast = reactive({ visible: false, message: '', type: 'info' });
const sharedChatEnabled = computed(() => Boolean(state.user?.share_context_chats ?? true));

const welcomeText = computed(() => {
  const name = state.user?.username || state.user?.email || '用户';
  const title = state.user?.user_type === 'teacher' ? '老师' : '同学';
  return `欢迎回来，${name} ${title}！`;
});
const welcomeSubtext = computed(() => {
  if (!isPrivileged.value) {
    return isTeacher.value ? '您已登录総日ナビ。' : '您已登录総日ナビ。';
  }
  return '在这里，您可以管理综合日语词库、文法、课文、阅读材料、后台用户和反馈。';
});
const statCards = computed(() => [
  {
    key: 'users',
    label: '用户',
    value: stats.value?.users?.total ?? '-',
    routeName: 'Users'
  },
  {
    key: 'vocabulary',
    label: '词条',
    value: stats.value?.vocabulary?.total ?? '-',
    routeName: 'Vocabulary'
  },
  {
    key: 'grammar',
    label: '文法',
    value: stats.value?.grammar?.total ?? '-',
    routeName: 'Grammar'
  },
  {
    key: 'text',
    label: '课文',
    value: stats.value?.text?.total ?? '-',
    routeName: 'Texts'
  },
  {
    key: 'feedback',
    label: '用户反馈',
    value: stats.value?.feedback?.total ?? '-',
    routeName: 'Feedback'
  }
]);
const historyTotalPages = computed(() => Math.max(1, Math.ceil(historyTotal.value / historyPageSize)));

function showToast(message, type = 'info') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  setTimeout(() => {
    toast.visible = false;
  }, 1200);
}

function goTo(routeName) {
  router.push({ name: routeName });
}

function enterClass(item) {
  router.push({ name: 'ClassDetail', params: { id: item.id } });
}

function assistantConversationTitle(item) {
  if (item?.is_processing || item?.reply_status === 'processing') return '正在思考中';
  return item?.context_label || '自由提问';
}

function assistantConversationPrefix(contextType) {
  if (contextType === 'vocabulary') return '单词：';
  if (contextType === 'grammar') return '文法：';
  if (contextType === 'text') return '文章：';
  return '';
}

function assistantConversationDisplayTitle(item) {
  if (!item) return '自由提问';
  return assistantConversationTitle(item);
}

function formatHistoryTime(value) {
  return value ? String(value).replace('T', ' ').slice(5, 16) : '-';
}

function notifyPending(label) {
  showToast(`${label}暂未开放`, 'info');
}

function passwordIsValid(value) {
  const password = String(value || '').trim();
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-.]/.test(password);
  return password.length >= 8 && password.length <= 20 && [hasLetter, hasNumber, hasSymbol].filter(Boolean).length >= 2;
}

function openAssistantConversation(item) {
  if (!item?.id) return;
  window.dispatchEvent(new CustomEvent('assistant:open-conversation', {
    detail: { id: item.id }
  }));
}

function confirmDeleteHistory(item) {
  deleteHistoryDialog.value = item;
}

function closeDeleteHistoryDialog() {
  deleteHistoryDialog.value = null;
}

function confirmRenameHistory(item) {
  renameHistoryDialog.value = item;
  renameHistoryDraft.value = assistantConversationTitle(item);
}

function closeRenameHistoryDialog() {
  renameHistoryDialog.value = null;
  renameHistoryDraft.value = '';
}

function syncAssistantDocking(nextValue) {
  assistantDockedToTopbar.value = Boolean(nextValue);
  localStorage.setItem(ASSISTANT_DOCKED_KEY, assistantDockedToTopbar.value ? '1' : '0');
  window.dispatchEvent(new CustomEvent('assistant:docking-changed', {
    detail: { dockedToTopbar: assistantDockedToTopbar.value }
  }));
}

function toggleAssistantDocking() {
  syncAssistantDocking(!assistantDockedToTopbar.value);
  showToast(assistantDockedToTopbar.value ? 'AI助手已收起到状态栏' : 'AI助手已恢复为悬浮球', 'success');
}

function openAccountSettings() {
  accountError.value = '';
  accountForm.username = state.user?.username || '';
  accountForm.password = '';
  accountForm.confirmPassword = '';
  accountDialogOpen.value = true;
}

function closeAccountSettings() {
  accountDialogOpen.value = false;
  accountError.value = '';
}

function openGradeSettings() {
  gradeError.value = '';
  gradeForm.grade = studentGradeOptions.includes(state.user?.grade) ? state.user.grade : '高年级';
  gradeDialogOpen.value = true;
}

function closeGradeSettings() {
  gradeDialogOpen.value = false;
  gradeError.value = '';
}

function openContact() {
  contactOpen.value = true;
}

function closeContact() {
  contactOpen.value = false;
}

async function loadStats() {
  if (!isPrivileged.value) return;
  try {
    stats.value = await apiRequest('/stats');
  } catch (error) {
    stats.value = null;
  }
}

async function loadClasses() {
  if (isPrivileged.value) return;
  classesLoading.value = true;
  try {
    const data = await apiRequest('/api/user/classes', {
      params: {
        limit: 200,
        offset: 0
      }
    });
    classRows.value = data.rows || [];
  } catch (error) {
    classRows.value = [];
  } finally {
    classesLoading.value = false;
  }
}

async function loadHistory() {
  if (isPrivileged.value) return;
  historyLoading.value = true;
  try {
    const data = await apiRequest('/api/user/assistant/conversations', {
      params: {
        limit: historyPageSize,
        offset: (historyPage.value - 1) * historyPageSize
      },
      timeout: 30000
    });
    historyRows.value = data.rows || [];
    historyTotal.value = data.total || 0;
  } catch (error) {
    historyRows.value = [];
    historyTotal.value = 0;
  } finally {
    historyLoading.value = false;
  }
}

function changeHistoryPage(nextPage) {
  historyPage.value = Math.min(Math.max(1, nextPage), historyTotalPages.value);
  loadHistory();
}

async function submitDeleteHistory() {
  if (!deleteHistoryDialog.value?.id) return;
  historyDeleting.value = true;
  try {
    await apiRequest(`/api/user/assistant/conversations/${deleteHistoryDialog.value.id}`, {
      method: 'DELETE',
      timeout: 30000
    });
    closeDeleteHistoryDialog();
    historyTotal.value = Math.max(0, historyTotal.value - 1);
    if (historyPage.value > Math.max(1, Math.ceil(historyTotal.value / historyPageSize))) {
      historyPage.value = Math.max(1, historyPage.value - 1);
    }
    await loadHistory();
    showToast('已删除', 'success');
  } catch (error) {
    showToast(error?.message || '删除失败', 'error');
  } finally {
    historyDeleting.value = false;
  }
}

async function submitRenameHistory() {
  if (!renameHistoryDialog.value?.id) return;
  const title = renameHistoryDraft.value.trim();
  if (!title) {
    showToast('标题不能为空', 'error');
    return;
  }

  historyRenaming.value = true;
  try {
    const data = await apiRequest(`/api/user/assistant/conversations/${renameHistoryDialog.value.id}/title`, {
      method: 'PATCH',
      body: { title },
      timeout: 30000
    });
    const conversation = data?.conversation || {};
    historyRows.value = historyRows.value.map((row) => (
      Number(row.id) === Number(renameHistoryDialog.value.id)
        ? {
            ...row,
            ...conversation,
            last_message_excerpt: conversation.last_message_excerpt || row.last_message_excerpt,
            last_message_at: conversation.last_message_at || row.last_message_at
          }
        : row
    ));
    closeRenameHistoryDialog();
    showToast('已重命名', 'success');
  } catch (error) {
    showToast(error?.message || '重命名失败', 'error');
  } finally {
    historyRenaming.value = false;
  }
}

async function submitAccountSettings() {
  const username = String(accountForm.username || '').trim();
  const password = String(accountForm.password || '');
  const confirmPassword = String(accountForm.confirmPassword || '');

  if (!username) {
    accountError.value = '请输入用户名';
    return;
  }
  if (!USERNAME_PATTERN.test(username)) {
    accountError.value = USERNAME_MESSAGE;
    return;
  }
  if (password) {
    if (!passwordIsValid(password)) {
      accountError.value = '密码需为8-20位，包含字母、数字、特殊符号中的至少两种';
      return;
    }
    if (password !== confirmPassword) {
      accountError.value = '两次输入的密码不一致';
      return;
    }
  }

  accountSaving.value = true;
  accountError.value = '';
  try {
    const payload = { username };
    if (password) payload.password = password;
    const data = await apiRequest('/api/user/me', {
      method: 'PATCH',
      body: payload,
      timeout: 30000
    });
    state.user = data.user;
    closeAccountSettings();
    showToast('账号设置已更新', 'success');
  } catch (error) {
    accountError.value = error?.message || '保存失败';
  } finally {
    accountSaving.value = false;
  }
}

async function submitGradeSettings() {
  if (isTeacher.value) return;
  const grade = String(gradeForm.grade || '').trim();
  if (!studentGradeOptions.includes(grade)) {
    gradeError.value = '请选择有效年级';
    return;
  }

  gradeSaving.value = true;
  gradeError.value = '';
  try {
    const data = await apiRequest('/api/user/me', {
      method: 'PATCH',
      body: { grade },
      timeout: 30000
    });
    state.user = data.user;
    closeGradeSettings();
    showToast('年级设置已更新', 'success');
  } catch (error) {
    gradeError.value = error?.message || '保存失败';
  } finally {
    gradeSaving.value = false;
  }
}

async function toggleSharedChat() {
  const nextValue = !sharedChatEnabled.value;
  try {
    const data = await apiRequest('/api/user/me', {
      method: 'PATCH',
      body: { share_context_chats: nextValue },
      timeout: 30000
    });
    state.user = data.user;
    showToast(nextValue ? '共享聊天已开启' : '共享聊天已关闭', 'success');
  } catch (error) {
    showToast(error?.message || '共享聊天设置保存失败', 'error');
  }
}

onMounted(async () => {
  await Promise.all([loadStats(), loadClasses(), loadHistory()]);
});
</script>
