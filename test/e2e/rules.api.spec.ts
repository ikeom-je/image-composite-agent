/**
 * カスタムルールプロンプト API E2E テスト
 *
 * Acceptance Criteria 対応（.kiro/specs/custom-rules-prompt/requirements.md）:
 * - AC 2.1: GET /chat/rules で全ルール一覧
 * - AC 2.2: GET /chat/rules/{ruleId} で個別取得
 * - AC 2.3: POST /chat/rules で新規作成（UUID自動採番）
 * - AC 2.4: PUT /chat/rules/{ruleId} で部分更新
 * - AC 2.5: DELETE /chat/rules/{ruleId} で削除
 * - AC 2.6: デフォルトルールDELETE は 403
 * - AC 5.1: 本文サイズ超過は400
 * - AC 6.1: デフォルトルール ruleId = jaa-subtitle-handbook-v1
 * - AC 6.2: デフォルトルール isDefault=true
 * - AC 11.x: GET /chat/rules/preview
 */

import { test, expect } from '@playwright/test'

const TEST_CONFIG = {
  chatApiUrl: process.env.CHAT_API_URL || process.env.API_URL?.replace(/\/images\/composite$/, '/chat') || '',
  timeout: 30000,
}

const DEFAULT_RULE_ID = 'jaa-subtitle-handbook-v1'

test.describe('Rules API テスト', () => {
  let api: any
  const createdRuleIds: string[] = []

  test.beforeAll(async ({ playwright }) => {
    if (!TEST_CONFIG.chatApiUrl) {
      test.skip()
      return
    }
    api = await playwright.request.newContext({ timeout: TEST_CONFIG.timeout })
  })

  test.afterAll(async () => {
    if (!api) return
    // テストで作成したルールをクリーンアップ
    for (const id of createdRuleIds) {
      await api.delete(`${TEST_CONFIG.chatApiUrl}/rules/${id}`).catch(() => {})
    }
    await api.dispose()
  })

  // ===== 一覧・デフォルトルール =====

  test.describe('GET /chat/rules', () => {
    test('AC 2.1 / 6.1 / 6.2: デフォルトルール（JAA）が含まれる', async () => {
      const res = await api.get(`${TEST_CONFIG.chatApiUrl}/rules`)
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.rules)).toBe(true)
      expect(body.rules.length).toBeGreaterThan(0)
      const jaa = body.rules.find((r: any) => r.ruleId === DEFAULT_RULE_ID)
      expect(jaa, 'デフォルトルールが存在すること').toBeDefined()
      expect(jaa.isDefault).toBe(true)
      expect(jaa.name).toContain('JAA')
    })
  })

  // ===== 作成・取得・更新・削除 =====

  test.describe('POST/GET/PUT/DELETE /chat/rules', () => {
    test('AC 2.3: POST /chat/rules で新規作成・UUID採番', async () => {
      const res = await api.post(`${TEST_CONFIG.chatApiUrl}/rules`, {
        data: { name: `e2e-${Date.now()}`, prompt: 'E2E用本文', isActive: false },
      })
      expect(res.status()).toBe(201)
      const body = await res.json()
      expect(body.rule.ruleId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
      expect(body.rule.name).toMatch(/^e2e-/)
      expect(body.rule.isDefault).toBe(false)
      expect(body.rule.isActive).toBe(false)
      expect(body.rule.createdAt).toBeTruthy()
      expect(body.rule.updatedAt).toBeTruthy()
      createdRuleIds.push(body.rule.ruleId)
    })

    test('AC 2.2: GET /chat/rules/{ruleId} で個別取得', async () => {
      const created = await api.post(`${TEST_CONFIG.chatApiUrl}/rules`, {
        data: { name: `e2e-get-${Date.now()}`, prompt: '取得テスト本文' },
      })
      const createdBody = await created.json()
      const id = createdBody.rule.ruleId
      createdRuleIds.push(id)

      const res = await api.get(`${TEST_CONFIG.chatApiUrl}/rules/${id}`)
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body.rule.ruleId).toBe(id)
      expect(body.rule.prompt).toBe('取得テスト本文')
    })

    test('AC 2.4: PUT /chat/rules/{ruleId} で部分更新（isActive のみ）', async () => {
      const created = await api.post(`${TEST_CONFIG.chatApiUrl}/rules`, {
        data: { name: `e2e-put-${Date.now()}`, prompt: '更新前本文', isActive: false },
      })
      const id = (await created.json()).rule.ruleId
      createdRuleIds.push(id)

      const res = await api.put(`${TEST_CONFIG.chatApiUrl}/rules/${id}`, {
        data: { isActive: true },
      })
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body.rule.isActive).toBe(true)
      expect(body.rule.prompt).toBe('更新前本文') // 部分更新で他属性維持
    })

    test('AC 2.5: DELETE /chat/rules/{ruleId} で削除（204）', async () => {
      const created = await api.post(`${TEST_CONFIG.chatApiUrl}/rules`, {
        data: { name: `e2e-del-${Date.now()}`, prompt: '削除対象' },
      })
      const id = (await created.json()).rule.ruleId

      const res = await api.delete(`${TEST_CONFIG.chatApiUrl}/rules/${id}`)
      expect(res.status()).toBe(204)

      // 削除確認
      const verify = await api.get(`${TEST_CONFIG.chatApiUrl}/rules/${id}`)
      expect(verify.status()).toBe(404)
    })

    test('GET /chat/rules/{ruleId} で存在しないIDは 404', async () => {
      const res = await api.get(`${TEST_CONFIG.chatApiUrl}/rules/00000000-0000-0000-0000-000000000000`)
      expect(res.status()).toBe(404)
    })

    test('AC 2.6: デフォルトルールDELETE は 403', async () => {
      const res = await api.delete(`${TEST_CONFIG.chatApiUrl}/rules/${DEFAULT_RULE_ID}`)
      expect(res.status()).toBe(403)
    })
  })

  // ===== バリデーション =====

  test.describe('POST /chat/rules バリデーション', () => {
    test('AC 5.1: 本文サイズ超過は 400', async () => {
      const res = await api.post(`${TEST_CONFIG.chatApiUrl}/rules`, {
        data: { name: 'oversize', prompt: 'a'.repeat(20000) },
      })
      expect(res.status()).toBe(400)
    })

    test('name 未指定は 400', async () => {
      const res = await api.post(`${TEST_CONFIG.chatApiUrl}/rules`, {
        data: { prompt: '本文のみ' },
      })
      expect(res.status()).toBe(400)
    })

    test('prompt 未指定は 400', async () => {
      const res = await api.post(`${TEST_CONFIG.chatApiUrl}/rules`, {
        data: { name: 'name-only' },
      })
      expect(res.status()).toBe(400)
    })
  })

  // ===== Preview =====

  test.describe('GET /chat/rules/preview', () => {
    test('AC 11.x: クエリなしで結合済みプロンプト + メタ情報が返る', async () => {
      const res = await api.get(`${TEST_CONFIG.chatApiUrl}/rules/preview`)
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('fullPrompt')
      expect(body).toHaveProperty('appliedRules')
      expect(body).toHaveProperty('totalChars')
      expect(body).toHaveProperty('ruleCount')
      expect(body).toHaveProperty('limits')
      expect(body.limits.maxPromptChars).toBeGreaterThan(0)
      expect(typeof body.totalChars).toBe('number')
    })

    test('?ruleIds=xxx で指定ルールのみ反映', async () => {
      const created = await api.post(`${TEST_CONFIG.chatApiUrl}/rules`, {
        data: {
          name: `e2e-preview-${Date.now()}`,
          prompt: 'プレビュー対象本文',
          isActive: false,
        },
      })
      const id = (await created.json()).rule.ruleId
      createdRuleIds.push(id)

      const res = await api.get(`${TEST_CONFIG.chatApiUrl}/rules/preview?ruleIds=${id}`)
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body.ruleCount).toBe(1)
      expect(body.appliedRules[0].ruleId).toBe(id)
      expect(body.fullPrompt).toContain('プレビュー対象本文')
    })
  })

  // ===== ruleId="preview" 防御 =====

  test.describe('ruleId="preview" 防御', () => {
    test('GET /chat/rules/preview は静的パスとして優先（200）', async () => {
      const res = await api.get(`${TEST_CONFIG.chatApiUrl}/rules/preview`)
      expect(res.status()).toBe(200)
    })
  })
})
