<script setup>
import { useToast } from '../composables/useToast.js'

const { toasts } = useToast()
</script>

<template>
  <div class="toast-host">
    <TransitionGroup name="toast">
      <div v-for="item in toasts" :key="item.id" class="toast" :class="`toast--${item.kind}`">
        {{ item.message }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast {
  min-width: 200px;
  max-width: 360px;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}

.toast--success {
  border-color: rgba(74, 222, 128, 0.5);
  color: #bbf7d0;
}

.toast--error {
  border-color: rgba(248, 113, 113, 0.55);
  color: #fecaca;
}

.toast--warn {
  border-color: rgba(251, 191, 36, 0.55);
  color: #fde68a;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
</style>
