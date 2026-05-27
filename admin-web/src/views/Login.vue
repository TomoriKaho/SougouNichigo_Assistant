<template>
  <main class="login-page">
    <section class="login-card">
      <div class="login-brand">総日ナビ</div>
      <h1>管理端登录</h1>
      <form @submit.prevent="submit">
        <label>
          账号
          <input v-model.trim="form.identifier" autocomplete="username" placeholder="用户名或邮箱" />
        </label>
        <label>
          密码
          <input v-model="form.password" autocomplete="current-password" type="password" placeholder="请输入密码" />
        </label>
        <p v-if="errorText" class="error">{{ errorText }}</p>
        <button type="submit" :disabled="state.loading">
          {{ state.loading ? '登录中...' : '登录' }}
        </button>
      </form>
    </section>
  </main>
</template>

<script setup>
import { computed, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const route = useRoute();
const { state, login } = useAuth();
const form = reactive({ identifier: '', password: '' });

const errorText = computed(() => {
  if (route.query.error === 'forbidden') return '无权访问管理端';
  return state.error;
});

async function submit() {
  const ok = await login(form);
  if (!ok) return;
  router.push(route.query.redirect || { name: 'Dashboard' });
}
</script>
