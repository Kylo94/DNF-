<script setup>
import { useDataTransfer } from '../composables/useDataTransfer.js'

const { modal, apply, cancel } = useDataTransfer()
</script>

<template>
  <div v-if="modal.open" class="modal-mask" @click.self="cancel()">
    <div class="modal" data-testid="import-modal">
      <h3>导入 Excel（角色登记 + 排表）</h3>
      <p class="modal__file">{{ modal.fileName }}</p>
      <p class="modal__text">
        角色登记：已解析出 <strong>{{ modal.roster.length }}</strong> 个角色；
        排表：<strong>{{ modal.lineup ? `${modal.lineup.waves.length} 波` : '文件中没有排表数据' }}</strong>
        <template v-if="modal.skipped">（另有 {{ modal.skipped }} 行无效数据已跳过）</template>
      </p>

      <label class="modal__check">
        <input v-model="modal.skipDuplicate" type="checkbox" data-testid="check-skip-dup" />
        <span>跳过与现有数据重复的记录（同一玩家 + 同一角色称呼）</span>
      </label>
      <p class="modal__text muted">
        「追加导入」保留现有数据并补充本次内容；「覆盖导入」会先清空现有角色与排表。
        排表里的角色按「归属玩家 + 角色称呼」对应回登记表。
      </p>

      <div class="modal__actions">
        <button class="btn btn--primary" data-testid="btn-import-append" @click="apply('append')">追加导入</button>
        <button class="btn btn--danger-ghost" data-testid="btn-import-replace" @click="apply('replace')">覆盖导入</button>
        <button class="btn btn--ghost" @click="cancel()">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 8, 14, 0.7);
  backdrop-filter: blur(3px);
  padding: 20px;
}

.modal {
  width: min(520px, 100%);
  padding: 22px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
}

.modal h3 {
  margin: 0 0 6px;
  font-size: 17px;
}

.modal__file {
  margin: 0 0 12px;
  font-size: 12.5px;
  color: var(--accent);
  word-break: break-all;
}

.modal__text {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-soft);
}

.modal__check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 6px;
  font-size: 13px;
  color: var(--text-soft);
  cursor: pointer;
}

.modal__check input {
  width: 16px;
  height: 16px;
  flex: none;
  accent-color: var(--accent);
}

.muted {
  color: var(--text-dim);
}

.modal__actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
  flex-wrap: wrap;
}
</style>
