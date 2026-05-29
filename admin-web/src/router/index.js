import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../composables/useAuth';
import AppLayout from '../components/AppLayout.vue';
import Dashboard from '../views/Dashboard.vue';
import Users from '../views/Users.vue';
import Vocabulary from '../views/Vocabulary.vue';
import Feedback from '../views/Feedback.vue';
import DatabaseManagement from '../views/DatabaseManagement.vue';
import Login from '../views/Login.vue';
import UserPlaceholder from '../views/UserPlaceholder.vue';

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
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'Dashboard', component: Dashboard },
      { path: 'course-study', name: 'CourseStudy', component: UserPlaceholder, meta: { title: '课程学习', requiresUser: true } },
      { path: 'word-study', name: 'WordStudy', component: UserPlaceholder, meta: { title: '单词学习', requiresUser: true } },
      { path: 'grammar-study', name: 'GrammarStudy', component: UserPlaceholder, meta: { title: '文法学习', requiresUser: true } },
      { path: 'text-study', name: 'TextStudy', component: UserPlaceholder, meta: { title: '课文学习', requiresUser: true } },
      { path: 'translation-practice', name: 'TranslationPractice', component: UserPlaceholder, meta: { title: '翻译练习', requiresUser: true } },
      { path: 'reading-materials', name: 'ReadingMaterials', component: UserPlaceholder, meta: { title: '阅读材料', requiresUser: true } },
      { path: 'users', name: 'Users', component: Users, meta: { requiresPrivileged: true } },
      { path: 'vocabulary', name: 'Vocabulary', component: Vocabulary, meta: { requiresPrivileged: true } },
      { path: 'feedback', name: 'Feedback', component: Feedback, meta: { requiresPrivileged: true } },
      { path: 'database', name: 'DatabaseManagement', component: DatabaseManagement, meta: { requiresPrivileged: true, requiresDev: true } }
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
    if (isAuthenticated.value) next({ name: 'Dashboard' });
    else next();
    return;
  }

  if (to.meta.requiresAuth && !isAuthenticated.value) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
    return;
  }

  if (to.meta.requiresPrivileged && !isPrivileged.value) {
    next({ name: 'Dashboard' });
    return;
  }

  if (to.meta.requiresUser && state.mode !== 'user') {
    next({ name: 'Dashboard' });
    return;
  }

  if (to.meta.requiresDev && !isDev.value) {
    next({ name: 'Dashboard' });
    return;
  }

  next();
});

export default router;
