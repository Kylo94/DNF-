<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { CHAR_TYPES, DIFFICULTIES, typeMeta } from '../constants.js'
import { formatPanel, parsePanel } from '../utils/format.js'

const props = defineProps({
  /** 编辑中的角色；为 null 表示新增模式 */
  editing: { type: Object, default: null },
  /** 已登记玩家，用于输入联想 */
  players: { type: Array, default: () => [] },
  /** 是否记住上一条的玩家/类型/难度（连续登记模式） */
  keepContext: { type: Boolean, default: true },
})

const emit = defineEmits(['submit', 'cancel', 'update:keepContext'])

const blank = () => ({
  player: '',
  name: '',
  type: 'C',
  panel: '',
  difficulty: DIFFICULTIES[0],
})

const form = reactive(blank())
const errors = reactive({})
const nameInput = ref(null)
const panelInput = ref(null)
const submitting = ref(false)

const isEdit = computed(() => Boolean(props.editing))

const activeType = computed(() => typeMeta(form.type))

const panelPreview = computed(() => {
  const parsed = parsePanel(form.panel)
  if (parsed === null) return ''
  const raw = String(form.panel).trim()
  const changedByUnit = parsed !== Number(raw.replace(/[，,\s]/g, ''))
  return changedByUnit ? `识别为 ${formatPanel(parsed)}` : ''
})

watch(
  () => props.editing,
  (row) => {
    clearErrors()
    if (row) {
      form.player = row.player
      form.name = row.name
      form.type = row.type
      form.panel = row.panel === null || row.panel === undefined ? '' : String(row.panel)
      form.difficulty = row.difficulty
      nextTick(() => nameInput.value?.focus())
    }
  },
  { immediate: true },
)

function clearErrors() {
  Object.keys(errors).forEach((key) => delete errors[key])
}

/** 外部（列表"填入表单"）调用：填入内容但保持新增模式 */
function prefill(row) {
  clearErrors()
  form.player = row.player
  form.name = row.name
  form.type = row.type
  form.panel = row.panel === null || row.panel === undefined ? '' : String(row.panel)
  form.difficulty = row.difficulty
  nextTick(() => nameInput.value?.focus())
}

defineExpose({ prefill })

function validate() {
  clearErrors()
  if (!form.player.trim()) errors.player = '请填写归属玩家'
  if (!form.name.trim()) errors.name = '请填写角色称呼'

  const parsed = parsePanel(form.panel)
  if (form.panel === '' || form.panel === null) {
    errors.panel = `请填写${activeType.value.panelLabel}`
  } else if (parsed === null) {
    errors.panel = '只能填写数字，可带 万 / 亿 单位'
  } else if (parsed <= 0) {
    errors.panel = '数值需要大于 0'
  }
  return Object.keys(errors).length === 0
}

function focusFirstError() {
  if (errors.player) return
  if (errors.name) nameInput.value?.focus()
  else if (errors.panel) panelInput.value?.focus()
}

function handleSubmit() {
  if (submitting.value) return
  if (!validate()) {
    focusFirstError()
    return
  }
  submitting.value = true
  try {
    emit(
      'submit',
      {
        player: form.player.trim(),
        name: form.name.trim(),
        type: form.type,
        panel: parsePanel(form.panel),
        difficulty: form.difficulty,
      },
      { isEdit: isEdit.value, reset: resetAfterSubmit },
    )
  } finally {
    submitting.value = false
  }
}

function resetAfterSubmit() {
  if (props.keepContext) {
    form.name = ''
    form.panel = ''
  } else {
    Object.assign(form, blank())
  }
  clearErrors()
  nextTick(() => nameInput.value?.focus())
}

function handleReset() {
  clearErrors()
  Object.assign(form, blank())
  nextTick(() => nameInput.value?.focus())
}
</script>

<template>
  <section class="card form-card">
    <header class="card__head">
      <div>
        <h2>{{ isEdit ? '编辑角色登记' : '角色登记' }}</h2>
        <p class="muted">
          {{ isEdit ? '修改后点击保存，将覆盖原记录' : '填完按 Enter 可继续登记下一个角色' }}
        </p>
      </div>
      <span v-if="isEdit" class="tag tag--warn">编辑中</span>
    </header>

    <form class="form" @submit.prevent="handleSubmit">
      <label class="field">
        <span class="field__label">归属玩家 <em>*</em></span>
        <input
          v-model="form.player"
          data-testid="input-player"
          type="text"
          list="player-options"
          placeholder="填写玩家ID / 昵称，如：老陈"
          :class="{ 'is-error': errors.player }"
        />
        <datalist id="player-options">
          <option v-for="p in players" :key="p.name" :value="p.name">{{ p.name }}（{{ p.count }} 个角色）</option>
        </datalist>
        <small v-if="errors.player" class="error">{{ errors.player }}</small>
        <small v-else class="hint">该角色隶属于哪个玩家（团里的登记人）</small>
      </label>

      <label class="field">
        <span class="field__label">角色称呼 <em>*</em></span>
        <input
          ref="nameInput"
          v-model="form.name"
          data-testid="input-name"
          type="text"
          placeholder="职业名称或角色ID，如：龙神 / 剑影"
          :class="{ 'is-error': errors.name }"
        />
        <small v-if="errors.name" class="error">{{ errors.name }}</small>
        <small v-else class="hint">建议用职业名，方便排表时一眼看出配置</small>
      </label>

      <div class="field-row">
        <label class="field">
          <span class="field__label">角色类型 <em>*</em></span>
          <select v-model="form.type" data-testid="select-type">
            <option v-for="t in CHAR_TYPES" :key="t.value" :value="t.value">
              {{ t.label }}
            </option>
          </select>
          <small class="hint">保存到 Excel 时写为 {{ form.type }}</small>
        </label>

        <label class="field">
          <span class="field__label">难度类型 <em>*</em></span>
          <select v-model="form.difficulty" data-testid="select-difficulty">
            <option v-for="d in DIFFICULTIES" :key="d" :value="d">{{ d }}</option>
          </select>
          <small class="hint">该角色这波打普通团还是困难团</small>
        </label>
      </div>

      <label class="field">
        <span class="field__label">
          {{ activeType.panelLabel }} <em>*</em>
          <span class="chip" :class="`chip--${form.type}`">{{ activeType.label }}</span>
        </span>
        <input
          ref="panelInput"
          v-model="form.panel"
          data-testid="input-panel"
          type="text"
          inputmode="decimal"
          :placeholder="activeType.panelPlaceholder"
          :class="{ 'is-error': errors.panel }"
        />
        <small v-if="errors.panel" class="error">{{ errors.panel }}</small>
        <small v-else class="hint">
          {{ activeType.panelTip }}
          <template v-if="panelPreview">· {{ panelPreview }}</template>
        </small>
      </label>

      <label class="switch">
        <input
          type="checkbox"
          :checked="keepContext"
          @change="emit('update:keepContext', $event.target.checked)"
        />
        <span>连续登记：提交后保留玩家 / 类型 / 难度，只清空角色称呼与面板</span>
      </label>

      <div class="actions">
        <button type="submit" class="btn btn--primary" data-testid="btn-submit">
          {{ isEdit ? '保存修改' : '登记角色' }}
        </button>
        <button v-if="isEdit" type="button" class="btn" @click="emit('cancel')">取消编辑</button>
        <button v-else type="button" class="btn btn--ghost" @click="handleReset">清空表单</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.form-card {
  position: sticky;
  top: 20px;
}

.card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.card__head h2 {
  margin: 0 0 4px;
  font-size: 18px;
  letter-spacing: 0.5px;
}

.muted {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.6;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field__label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-soft);
}

.field__label em {
  color: var(--danger);
  font-style: normal;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

input,
select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s, box-shadow 0.18s;
}

input:focus,
select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(240, 198, 116, 0.15);
}

input.is-error {
  border-color: var(--danger);
}

.hint {
  font-size: 12px;
  color: var(--text-dim);
}

.error {
  font-size: 12px;
  color: var(--danger);
}

.chip {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  border: 1px solid transparent;
}

.chip--C {
  color: #93c5fd;
  border-color: rgba(96, 165, 250, 0.45);
  background: rgba(59, 130, 246, 0.12);
}

.chip--N {
  color: #86efac;
  border-color: rgba(74, 222, 128, 0.45);
  background: rgba(34, 197, 94, 0.12);
}

.switch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-dim);
  cursor: pointer;
}

.switch input {
  width: 16px;
  height: 16px;
  flex: none;
  accent-color: var(--accent);
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
</style>
