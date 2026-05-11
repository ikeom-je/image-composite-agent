// frontend/src/types/rules.ts

export interface Rule {
  ruleId: string
  name: string
  prompt: string
  isDefault: boolean
  isActive: boolean
  createdAt: string  // ISO8601
  updatedAt: string  // ISO8601
}

export interface InlineRule {
  name: string
  prompt: string
}

export interface RulesPreviewResponse {
  fullPrompt: string
  appliedRules: { ruleId: string; name: string; chars: number }[]
  totalChars: number
  ruleCount: number
  limits: {
    maxPromptChars: number
    maxCount: number
    maxCombinedChars: number
  }
}

export interface PendingTestRule {
  name: string
  prompt: string
}

export interface RuleCreateInput {
  name: string
  prompt: string
  isActive?: boolean
}

export interface RuleUpdateInput {
  name?: string
  prompt?: string
  isActive?: boolean
}
