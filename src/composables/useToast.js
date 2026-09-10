import { reactive } from 'vue'

/** 极简全局消息提示 */
const state = reactive({ items: [] })
let seed = 0

export function toast(message, kind = 'info', duration = 2600) {
  const id = ++seed
  state.items.push({ id, message, kind })
  setTimeout(() => {
    const index = state.items.findIndex((t) => t.id === id)
    if (index !== -1) state.items.splice(index, 1)
  }, duration)
}

export function useToast() {
  return { toasts: state.items, toast }
}
