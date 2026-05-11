// frontend/src/stores/rules.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRulesApi } from '@/composables/useRulesApi'
import type { Rule, RuleCreateInput, RuleUpdateInput, RulesPreviewResponse } from '@/types/rules'

export const useRulesStore = defineStore('rules', () => {
  const rules = ref<Rule[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedId = ref<string | null>(null)
  const draftDirty = ref(false)
  const preview = ref<RulesPreviewResponse | null>(null)

  const api = useRulesApi()

  const selectedRule = computed(() =>
    rules.value.find((r) => r.ruleId === selectedId.value) || null,
  )

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      rules.value = await api.list()
    } catch (e: any) {
      error.value = e?.response?.data?.error || e?.message || 'ルールの取得に失敗しました'
    } finally {
      loading.value = false
    }
  }

  async function create(input: RuleCreateInput): Promise<Rule | null> {
    error.value = null
    try {
      const rule = await api.create(input)
      rules.value.push(rule)
      selectedId.value = rule.ruleId
      draftDirty.value = false
      return rule
    } catch (e: any) {
      error.value = e?.response?.data?.error || e?.message || '作成に失敗しました'
      return null
    }
  }

  async function update(ruleId: string, patch: RuleUpdateInput): Promise<Rule | null> {
    error.value = null
    try {
      const rule = await api.update(ruleId, patch)
      const idx = rules.value.findIndex((r) => r.ruleId === ruleId)
      if (idx >= 0) rules.value[idx] = rule
      draftDirty.value = false
      return rule
    } catch (e: any) {
      error.value = e?.response?.data?.error || e?.message || '更新に失敗しました'
      return null
    }
  }

  async function remove(ruleId: string): Promise<boolean> {
    error.value = null
    try {
      await api.remove(ruleId)
      rules.value = rules.value.filter((r) => r.ruleId !== ruleId)
      if (selectedId.value === ruleId) selectedId.value = null
      return true
    } catch (e: any) {
      error.value = e?.response?.data?.error || e?.message || '削除に失敗しました'
      return false
    }
  }

  async function fetchPreview(ruleIds?: string[]) {
    error.value = null
    try {
      preview.value = await api.fetchPreview(ruleIds)
    } catch (e: any) {
      error.value = e?.response?.data?.error || e?.message || 'プレビュー取得に失敗しました'
    }
  }

  function select(ruleId: string | null) {
    selectedId.value = ruleId
    draftDirty.value = false
  }

  function setDraftDirty(value: boolean) {
    draftDirty.value = value
  }

  return {
    rules,
    loading,
    error,
    selectedId,
    selectedRule,
    draftDirty,
    preview,
    fetchAll,
    create,
    update,
    remove,
    fetchPreview,
    select,
    setDraftDirty,
  }
})
