// frontend/src/composables/useRulesApi.ts
import axios from 'axios'
import { useConfigStore } from '@/stores/config'
import type {
  Rule,
  RuleCreateInput,
  RuleUpdateInput,
  RulesPreviewResponse,
} from '@/types/rules'

function getRulesEndpoint(): string {
  const configStore = useConfigStore()
  const chatUrl = configStore.chatApiUrl
  if (!chatUrl) {
    throw new Error('chatApiUrl is not configured')
  }
  return `${chatUrl}/rules`
}

export function useRulesApi() {
  async function list(): Promise<Rule[]> {
    const endpoint = getRulesEndpoint()
    const res = await axios.get<{ rules: Rule[] }>(endpoint, { timeout: 15000 })
    return res.data.rules
  }

  async function create(input: RuleCreateInput): Promise<Rule> {
    const endpoint = getRulesEndpoint()
    const res = await axios.post<{ rule: Rule }>(endpoint, input, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    })
    return res.data.rule
  }

  async function update(ruleId: string, patch: RuleUpdateInput): Promise<Rule> {
    const endpoint = getRulesEndpoint()
    const res = await axios.put<{ rule: Rule }>(`${endpoint}/${ruleId}`, patch, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    })
    return res.data.rule
  }

  async function remove(ruleId: string): Promise<void> {
    const endpoint = getRulesEndpoint()
    await axios.delete(`${endpoint}/${ruleId}`, { timeout: 15000 })
  }

  async function fetchPreview(ruleIds?: string[]): Promise<RulesPreviewResponse> {
    const endpoint = getRulesEndpoint()
    const params = ruleIds && ruleIds.length > 0 ? { ruleIds: ruleIds.join(',') } : undefined
    const res = await axios.get<RulesPreviewResponse>(`${endpoint}/preview`, {
      params,
      timeout: 15000,
    })
    return res.data
  }

  return { list, create, update, remove, fetchPreview }
}
