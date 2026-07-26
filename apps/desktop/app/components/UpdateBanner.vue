<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useUpdateStore } from '~/stores/update'
import { useRunnerStore } from '~/stores/runner'
import { useRecorderStore } from '~/stores/recorder'

const updateStore = useUpdateStore()
const runnerStore = useRunnerStore()
const recorderStore = useRecorderStore()

/** Never interrupt in-progress work (FR-011): hold the banner while a run/recording is active. */
const workInProgress = computed(() => runnerStore.isRunning || recorderStore.isRecording)

// Show only when a downloaded update is ready to apply, and no work is in progress.
const show = computed(() => updateStore.isReady && !workInProgress.value)

const version = computed(() => updateStore.info?.version ?? '')

onMounted(() => {
  void updateStore.init()
})

onUnmounted(() => {
  updateStore.teardown()
})

function restart() {
  void updateStore.quitAndInstall()
}
</script>

<template>
  <Transition name="update-banner">
    <div
      v-if="show"
      class="update-banner"
      role="status"
      data-testid="update-banner"
    >
      <i class="pi pi-download banner-icon" />
      <span class="banner-text">
        A new version{{ version ? ` (${version})` : '' }} is ready to install.
      </span>
      <div class="banner-actions">
        <Button
          label="Restart & update"
          icon="pi pi-refresh"
          size="small"
          data-testid="update-restart-btn"
          @click="restart"
        />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.update-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: var(--primary-color, #3b82f6);
  color: var(--primary-color-text, #ffffff);
  font-size: 0.875rem;
}

.banner-icon {
  font-size: 1rem;
}

.banner-text {
  flex: 1;
  min-width: 0;
}

.banner-actions {
  display: flex;
  gap: 0.5rem;
}

.update-banner-enter-active,
.update-banner-leave-active {
  transition: opacity 0.2s ease;
}

.update-banner-enter-from,
.update-banner-leave-to {
  opacity: 0;
}
</style>
