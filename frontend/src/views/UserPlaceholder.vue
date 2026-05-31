<template>
  <section class="card placeholder-page">
    <h2>{{ title }}</h2>
    <p class="muted">该页面暂未实现。</p>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = computed(() => route.meta.title || '占位页面');
</script>
