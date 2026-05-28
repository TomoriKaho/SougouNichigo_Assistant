<template>
  <div class="dashboard-page">
    <div class="dashboard-top-row" :class="{ 'user-welcome-only': !isPrivileged }">
      <section ref="welcomeCardRef" class="card dashboard-welcome-card">
        <h2 class="dashboard-welcome-text">欢迎回来，{{ welcomeText }}</h2>
        <p class="dashboard-welcome-subtext">
          {{ welcomeSubtext }}
        </p>
      </section>

      <section v-if="isPrivileged" class="card dashboard-summary-card">
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
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { apiRequest } from '../utils/apiClient';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const { state, isPrivileged } = useAuth();
const stats = ref(null);

const welcomeText = computed(() => state.user?.username || state.user?.email || '管理员');
const welcomeSubtext = computed(() => {
  if (!isPrivileged.value) return '您已登录総日ナビ。';
  return '在这里，您可以管理综合日语词库、后台用户、用户反馈和数据库备份。';
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
    key: 'feedback',
    label: '用户反馈',
    value: stats.value?.feedback?.total ?? '-',
    routeName: 'Feedback'
  }
]);

function goTo(routeName) {
  router.push({ name: routeName });
}

async function loadStats() {
  if (!isPrivileged.value) return;
  try {
    stats.value = await apiRequest('/stats');
  } catch (error) {
    stats.value = null;
  }
}

onMounted(loadStats);
</script>
