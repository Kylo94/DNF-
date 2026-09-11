<script setup>
import { computed, ref } from 'vue'
import { BENCH_REASON_LABEL } from '../../constants.js'
import { typeLabel } from '../../constants.js'
import { formatPanel } from '../../utils/format.js'

const props = defineProps({
  bench: { type: Array, default: () => [] },
  poolStats: { type: Object, default: () => ({ total: 0, c: 0, n: 0 }) },
  assignedCount: { type: Number, default: 0 },
  raidSize: { type: Number, default: 12 },
  difficulty: { type: String, default: '' },
  waveName: { type: String, default: '' },
})

const emit = defineEmits(['drag-start', 'drag-end', 'drop-bench', 'select'])

const keyword = ref('')
const onlyType = ref('all')
const dragOver = ref(false)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return props.bench.filter((item) => {
    if (onlyType.value !== 'all' && item.character.type !== onlyType.value) return false
    if (kw && !`${item.character.player} ${item.character.name}`.toLowerCase().includes(kw)) return false
    return true
  })
})

function onDragStart(event, character) {
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', character.id)
  emit('drag-start', { kind: 'bench', characterId: character.id })
}
</script>

<template>
  <section class="bench card">
    <header class="bench__head">
      <div class="bench__title">
        <h3>未上场角色</h3>
        <span class="muted">
          所有波次都没排上的角色 · {{ difficulty }} 已登记 {{ poolStats.total }} 个（输出C {{ poolStats.c }} ·
          辅助奶 {{ poolStats.n }}）· {{ waveName }}当前 {{ assignedCount }}/{{ raidSize }}
        </span>
      </div>
      <div class="bench__filters">
        <input v-model="keyword" type="search" placeholder="搜索玩家/角色…" />
        <select v-model="onlyType">
          <option value="all">全部类型</option>
          <option value="C">输出C</option>
          <option value="N">辅助奶</option>
        </select>
      </div>
    </header>

    <div
      class="bench__drop"
      :class="{ 'bench__drop--over': dragOver }"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="dragOver = false; emit('drop-bench')"
    >
      <template v-if="filtered.length">
        <div
          v-for="item in filtered"
          :key="item.character.id"
          class="chip"
          data-testid="bench-chip"
          :data-name="item.character.name"
          :data-player="item.character.player"
          :class="[item.character.type === 'C' ? 'chip--c' : 'chip--n', { 'chip--conflict': item.reason === 'player-conflict' }]"
          draggable="true"
          @dragstart="onDragStart($event, item.character)"
          @dragend="emit('drag-end')"
          @click="emit('select', item.character.id)"
        >
          <span class="chip__name">{{ item.character.name }}</span>
          <span class="chip__meta">{{ item.character.player }} · {{ formatPanel(item.character.panel) }}</span>
          <span class="chip__tags">
            <span class="tag">{{ typeLabel(item.character.type) }}</span>
            <span v-if="item.reason === 'player-conflict'" class="tag tag--warn2">
              {{ BENCH_REASON_LABEL[item.reason] }}
            </span>
          </span>
        </div>
      </template>
      <p v-else class="empty">
        {{
          bench.length
            ? '没有符合筛选条件的角色'
            : waveName + '的角色已全部排上（或还没有登记' + difficulty + '的角色）'
        }}
      </p>
    </div>

    <p class="bench__tip">
      提示：把这里的角色拖到队伍空位即可上场（当前是{{ waveName }}）；把场上角色拖到此处即下场；跨波次可以把 A 波的角色直接拖到 B 波的位置。
      也可以「先点场上位置、再点目标位置」完成移动/互换。
    </p>
  </section>
</template>

<style scoped>
.bench__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.bench__title h3 {
  margin: 0 0 4px;
  font-size: 15px;
}

.muted {
  font-size: 12.5px;
  color: var(--text-dim);
}

.bench__filters {
  display: flex;
  gap: 8px;
}

.bench__filters input,
.bench__filters select {
  padding: 7px 10px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text);
  font-size: 13px;
  outline: none;
}

.bench__drop {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 76px;
  max-height: 330px;
  overflow-y: auto;
  align-content: flex-start;
  padding: 10px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  transition: border-color 0.15s, background 0.15s;
}

.bench__drop--over {
  border-color: var(--accent);
  background: rgba(240, 198, 116, 0.07);
}

.chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 11px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  cursor: grab;
}

.chip--c {
  border-left: 3px solid #60a5fa;
}

.chip--n {
  border-left: 3px solid #4ade80;
}

.chip--conflict {
  opacity: 0.72;
}

.chip__name {
  font-size: 13.5px;
  font-weight: 600;
}

.chip__meta {
  font-size: 11.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

.chip__tags {
  display: flex;
  gap: 5px;
  margin-top: 2px;
}

.tag {
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--text-dim);
  border: 1px solid var(--border);
}

.tag--warn2 {
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.4);
}

.empty {
  margin: 0;
  align-self: center;
  font-size: 12.5px;
  color: var(--text-dim);
}

.bench__tip {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-dim);
}
</style>
