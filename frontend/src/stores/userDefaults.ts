import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Preset } from './compositeDefaults'

const STORAGE_KEY = 'composite-user-defaults'

export interface UserDefaults {
  baseImage?: string
  baseOpacity?: number
}

function loadFromStorage(): UserDefaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as UserDefaults) : {}
  } catch {
    return {}
  }
}

export const useUserDefaultsStore = defineStore('userDefaults', () => {
  const overrides = ref<UserDefaults>(loadFromStorage())

  const hasOverrides = computed(
    () => overrides.value.baseImage !== undefined || overrides.value.baseOpacity !== undefined,
  )

  function applyPreset(preset: Preset): void {
    overrides.value = {
      baseImage: preset.baseImage,
      baseOpacity: preset.baseOpacity,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides.value))
  }

  function reset(): void {
    overrides.value = {}
    localStorage.removeItem(STORAGE_KEY)
  }

  return { overrides, hasOverrides, applyPreset, reset }
})
