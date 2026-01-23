<script setup lang="ts">
// Default layout for the application
</script>

<template>
  <div class="layout">
    <slot />
  </div>
</template>

<style scoped>
.layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
