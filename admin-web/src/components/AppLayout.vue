<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <span>総日ナビ</span>
      </div>
      <nav>
        <RouterLink to="/" end>仪表盘</RouterLink>
        <RouterLink to="/users">用户管理</RouterLink>
        <RouterLink to="/vocabulary">词库管理</RouterLink>
        <RouterLink to="/feedback">反馈处理</RouterLink>
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
          <span class="chip identity-chip">{{ user.username || user.email }}</span>
          <span class="chip role-chip" :class="user.role">{{ roleLabel }}</span>
          <span class="chip type-chip" :class="userTypeClass">{{ userTypeLabel }}</span>
          <button class="ghost" @click="handleLogout">退出</button>
        </div>
      </header>
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const route = useRoute();
const router = useRouter();
const { state, logout, isDev } = useAuth();

const titles = {
  Dashboard: '仪表盘',
  Users: '用户管理',
  Vocabulary: '词库管理',
  Feedback: '反馈处理',
  DatabaseManagement: '数据库管理'
};

const user = computed(() => state.user);
const title = computed(() => titles[route.name] || '総日ナビ');
const roleLabel = computed(() => {
  if (user.value?.role === 'dev') return 'DEV';
  if (user.value?.role === 'admin') return 'ADMIN';
  return user.value?.role || '-';
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

function handleLogout() {
  logout();
  router.push({ name: 'Login' });
}
</script>
