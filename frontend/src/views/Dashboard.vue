<template>
  <div class="dashboard-page">
    <div v-if="isPrivileged" class="dashboard-top-row">
      <section class="card dashboard-welcome-card">
        <h2 class="dashboard-welcome-text">欢迎回来，{{ welcomeText }}</h2>
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
          <h2 class="dashboard-welcome-text">欢迎回来，{{ welcomeText }}</h2>
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
            <button class="dashboard-setting-item" type="button" @click="notifyPending('账号设置')">
              <span>账号设置</span>
              <span class="dashboard-setting-arrow">›</span>
            </button>
            <button class="dashboard-setting-item" type="button" @click="notifyPending('年级设置')">
              <span>年级设置</span>
              <span class="dashboard-setting-arrow">›</span>
            </button>
            <button class="dashboard-setting-item" type="button" @click="notifyPending('开启AI助手悬浮球')">
              <span>开启AI助手悬浮球</span>
              <span class="dashboard-setting-switch" aria-hidden="true"></span>
            </button>
            <button class="dashboard-setting-item" type="button" @click="notifyPending('加入共享聊天')">
              <span>加入共享聊天</span>
              <span class="dashboard-setting-switch" aria-hidden="true"></span>
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
            <button
              v-for="item in historyRows"
              :key="item.id"
              class="assistant-history-item-main dashboard-history-item"
              type="button"
              @click="openAssistantConversation(item)"
            >
              <div class="assistant-history-item-header dashboard-history-item-header">
                <span :title="assistantConversationTitle(item)">{{ assistantConversationTitle(item) }}</span>
                <small>{{ formatHistoryTime(item.last_message_at || item.updated_at || item.created_at) }}</small>
              </div>
              <em :title="item.last_message_excerpt || '暂无对话内容'">{{ item.last_message_excerpt || '暂无对话内容' }}</em>
            </button>
          </div>
          <div v-else class="dashboard-panel-empty">还没有对话历史。</div>
        </section>
      </div>
    </div>

    <div v-if="!isPrivileged" class="dashboard-user-footer">
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

    <div v-if="toast.visible" class="toast" :class="toast.type">{{ toast.message }}</div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest } from '../utils/apiClient';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const { state, isPrivileged, isTeacher } = useAuth();
const stats = ref(null);
const classRows = ref([]);
const classesLoading = ref(false);
const historyRows = ref([]);
const historyLoading = ref(false);
const historyPage = ref(1);
const historyPageSize = 4;
const historyTotal = ref(0);
const contactOpen = ref(false);
const toast = reactive({ visible: false, message: '', type: 'info' });

const welcomeText = computed(() => state.user?.username || state.user?.email || '管理员');
const welcomeSubtext = computed(() => {
  if (!isPrivileged.value) {
    return isTeacher.value ? '您已登录総日ナビ，可以创建、管理并进入自己的班级。' : '您已登录総日ナビ，可以通过班级码加入并进入自己的班级。';
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
  return item?.context_label || '自由提问';
}

function formatHistoryTime(value) {
  return value ? String(value).replace('T', ' ').slice(5, 16) : '-';
}

function notifyPending(label) {
  showToast(`${label}暂未开放`, 'info');
}

function openAssistantConversation(item) {
  if (!item?.id) return;
  window.dispatchEvent(new CustomEvent('assistant:open-conversation', {
    detail: { id: item.id }
  }));
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

onMounted(async () => {
  await Promise.all([loadStats(), loadClasses(), loadHistory()]);
});
</script>
