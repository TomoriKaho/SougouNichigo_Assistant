import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../composables/useAuth';
import AppLayout from '../components/AppLayout.vue';
import Dashboard from '../views/Dashboard.vue';
import Users from '../views/Users.vue';
import Vocabulary from '../views/Vocabulary.vue';
import Feedback from '../views/Feedback.vue';
import DatabaseManagement from '../views/DatabaseManagement.vue';
import Login from '../views/Login.vue';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { public: true }
  },
  {
    path: '/',
    component: AppLayout,
    meta: { requiresAuth: true, requiresPrivileged: true },
    children: [
      { path: '', name: 'Dashboard', component: Dashboard },
      { path: 'users', name: 'Users', component: Users },
      { path: 'vocabulary', name: 'Vocabulary', component: Vocabulary },
      { path: 'feedback', name: 'Feedback', component: Feedback },
      { path: 'database', name: 'DatabaseManagement', component: DatabaseManagement, meta: { requiresDev: true } }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
});

router.beforeEach(async (to, from, next) => {
  const { isAuthenticated, isDev, isPrivileged, fetchMe, state } = useAuth();

  if (!state.user && state.token) await fetchMe();

  if (to.meta.public) {
    if (isAuthenticated.value && isPrivileged.value) next({ name: 'Dashboard' });
    else next();
    return;
  }

  if (to.meta.requiresAuth && !isAuthenticated.value) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
    return;
  }

  if (to.meta.requiresPrivileged && !isPrivileged.value) {
    next({ name: 'Login', query: { error: 'forbidden' } });
    return;
  }

  if (to.meta.requiresDev && !isDev.value) {
    next({ name: 'Dashboard' });
    return;
  }

  next();
});

export default router;
