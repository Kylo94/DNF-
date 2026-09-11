<script setup>
import { computed, ref } from 'vue'
import { typeLabel } from '../constants.js'
import { formatPanel } from '../utils/format.js'

const props = defineProps({
  /** [{ player, characters: [] }] */
  groups: { type: Array, default: () => [] },
  /** 当前显示的（筛选后）角色总数 */
  visibleCount: { type: Number, default: 0 },
})

const emit = defineEmits(['edit', 'prefill', 'remove', 'remove-player'])

/** 折叠起来的玩家（按玩家名记录） */
const collapsed = ref(new Set())

function isCollapsed(player) {
  return collapsed.value.has(player)
}

function toggleGroup(player) {
  const next = new Set(collapsed.value)
  if (next.has(player)) next.delete(player)
  else next.add(player)
  collapsed.value = next
}

const allCollapsed = computed(
  () => props.groups.length > 0 && props.groups.every((g) => collapsed.value.has(g.player)),
)

function toggleAll() {
  collapsed.value = allCollapsed.value ? new Set() : new Set(props.groups.map((g) => g.player))
}

function groupSummary(chars) {
  const c = chars.filter((x) => x.type === 'C').length
  const n = chars.length - c
  return `输出C ${c} · 辅助奶 ${n}`
}

function playerCounts(chars) {
  return {
    normal: chars.filter((x) => x.difficulty === '普通团').length,
    hard: chars.filter((x) => x.difficulty === '困难团').length,
  }
}
</script>

<template>
  <div v-if="!visibleCount" class="empty">
    <p class="empty__title">暂无登记数据</p>
    <p class="empty__desc">用左侧表单登记角色，或点击「导入 Excel」读取现有的角色数据表。</p>
  </div>

  <div v-else class="groups">
    <div class="groups__tools">
      <span class="muted">{{ groups.length }} 位玩家</span>
      <button class="btn btn--tiny btn--ghost" data-testid="btn-toggle-all-groups" @click="toggleAll">
        {{ allCollapsed ? '全部展开' : '全部折叠' }}
      </button>
    </div>

    <section v-for="group in groups" :key="group.player" class="group">
      <header
        class="group__head"
        :class="{ 'group__head--collapsed': isCollapsed(group.player) }"
        :data-testid="`group-head-${group.player}`"
        :title="isCollapsed(group.player) ? '点击展开该玩家的角色' : '点击折叠该玩家的角色'"
        @click="toggleGroup(group.player)"
      >
        <div class="group__title">
          <span class="chev" :class="{ 'chev--collapsed': isCollapsed(group.player) }">▾</span>
          <span class="player">{{ group.player }}</span>
          <span class="dot">·</span>
          <span class="muted">{{ group.characters.length }} 个角色</span>
          <span class="muted">{{ groupSummary(group.characters) }}</span>
          <span class="mini mini--normal">普通 {{ playerCounts(group.characters).normal }}</span>
          <span class="mini mini--hard">困难 {{ playerCounts(group.characters).hard }}</span>
        </div>
        <button
          v-if="isCollapsed(group.player)"
          class="btn btn--tiny btn--ghost"
          :data-testid="`group-expand-${group.player}`"
          @click.stop="toggleGroup(group.player)"
        >
          展开 {{ group.characters.length }} 个角色
        </button>
        <button class="btn btn--tiny btn--danger-ghost" @click.stop="emit('remove-player', group.player)">
          删除该玩家全部
        </button>
      </header>

      <div v-if="!isCollapsed(group.player)" class="table-wrap" :data-testid="`group-table-${group.player}`">
        <table>
          <thead>
            <tr>
              <th class="col-name">角色称呼</th>
              <th class="col-type">角色类型</th>
              <th class="col-panel">面板数值</th>
              <th class="col-diff">难度类型</th>
              <th class="col-ops">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in group.characters" :key="row.id">
              <td class="col-name">{{ row.name }}</td>
              <td class="col-type">
                <span class="tag" :class="row.type === 'C' ? 'tag--c' : 'tag--n'">{{ typeLabel(row.type) }}</span>
              </td>
              <td class="col-panel num">{{ formatPanel(row.panel) }}</td>
              <td class="col-diff">
                <span class="tag" :class="row.difficulty === '困难团' ? 'tag--hard' : 'tag--normal'">
                  {{ row.difficulty }}
                </span>
              </td>
              <td class="col-ops">
                <button class="btn btn--tiny" @click="emit('edit', row)">编辑</button>
                <button class="btn btn--tiny btn--ghost" title="把内容填入表单，方便照着登记同配置角色" @click="emit('prefill', row)">
                  填入表单
                </button>
                <button class="btn btn--tiny btn--danger-ghost" @click="emit('remove', row)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.empty {
  padding: 56px 24px;
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.015);
}

.empty__title {
  margin: 0 0 8px;
  font-size: 15px;
  color: var(--text-soft);
}

.empty__desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-dim);
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.group {
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  background: var(--bg-card);
}

.groups__tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 12.5px;
}

.chev {
  display: inline-block;
  color: var(--text-dim);
  font-size: 12px;
  transition: transform 0.15s ease;
}

.chev--collapsed {
  transform: rotate(-90deg);
}

.group__head {
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: linear-gradient(90deg, rgba(240, 198, 116, 0.09), rgba(240, 198, 116, 0));
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}

.group__head:hover {
  background: linear-gradient(90deg, rgba(240, 198, 116, 0.16), rgba(240, 198, 116, 0.02));
}

.group__head--collapsed {
  border-bottom-color: transparent;
}

.group__title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
}

.player {
  font-size: 15px;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.5px;
}

.dot {
  color: var(--text-dim);
}

.muted {
  color: var(--text-dim);
}

.mini {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11.5px;
  border: 1px solid var(--border);
  color: var(--text-dim);
}

.mini--normal {
  color: #cbd5e1;
}

.mini--hard {
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.35);
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}

th,
td {
  padding: 9px 14px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  white-space: nowrap;
}

thead th {
  font-weight: 500;
  font-size: 12px;
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.02);
}

tbody tr:last-child td {
  border-bottom: none;
}

tbody tr:hover {
  background: rgba(240, 198, 116, 0.05);
}

.num {
  font-variant-numeric: tabular-nums;
  color: var(--text-soft);
}

.col-ops {
  width: 1%;
  text-align: right;
}

.col-ops .btn + .btn {
  margin-left: 6px;
}

.tag {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid transparent;
}

.tag--c {
  color: #93c5fd;
  border-color: rgba(96, 165, 250, 0.4);
  background: rgba(59, 130, 246, 0.12);
}

.tag--n {
  color: #86efac;
  border-color: rgba(74, 222, 128, 0.4);
  background: rgba(34, 197, 94, 0.12);
}

.tag--normal {
  color: #e2e8f0;
  border-color: rgba(148, 163, 184, 0.35);
  background: rgba(148, 163, 184, 0.1);
}

.tag--hard {
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.4);
  background: rgba(239, 68, 68, 0.12);
}
</style>
