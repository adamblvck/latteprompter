/** LattePrompter data model. Plain JSON, stable ids — one store.json, atomic writes. */

export type ThemeMode = 'dark' | 'light'
export type ViewMode = 'grid' | 'list'

/**
 * 'follow'   — ASR-driven: the script scrolls as you speak (the headline feature)
 * 'constant' — classic teleprompter, fixed wpm-derived speed
 * 'manual'   — arrow keys / wheel only
 */
export type ScrollMode = 'follow' | 'constant' | 'manual'

export type FontId = 'atkinson' | 'inter' | 'literata' | 'opendyslexic' | 'system'

export type CollectionAccent = 'air' | 'fire' | 'water' | 'earth' | 'akasha'

export interface Collection {
  id: string
  name: string
  /** Accent from the five element colors, cycled at creation. */
  accent: CollectionAccent
  createdAt: string
  modifiedAt: string
}

export interface PrompterSettings {
  fontId: FontId
  /** px, 24–120 */
  fontSize: number
  /** unitless, 1.2–2.2 */
  lineHeight: number
  /** Horizontal mirror for beam-splitter glass rigs. */
  mirror: boolean
  scrollMode: ScrollMode
  /** wpm for 'constant' mode, 80–260. */
  constantWpm: number
}

export interface Script {
  id: string
  title: string
  /** markdown */
  body: string
  /** null = uncollected — shows under "All Scripts" only. */
  collectionId: string | null
  /** Sparse per-script overrides; merged over settings.prompterDefaults. */
  promptOverrides: Partial<PrompterSettings> | null
  createdAt: string
  updatedAt: string
  lastPromptedAt: string | null
}

export interface AsrSettings {
  /** id of the selected model preset, or null = none chosen yet. */
  modelId: string | null
  /** MediaDeviceInfo.deviceId, or null = system default. */
  micDeviceId: string | null
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface UiState {
  themeMode: ThemeMode
  libraryView: ViewMode
  windowBounds: WindowBounds | null
}

export interface Settings {
  prompterDefaults: PrompterSettings
  asr: AsrSettings
}

export const SCHEMA_VERSION = 1

export interface StoreFile {
  schemaVersion: number
  savedAt: string
  collections: Record<string, Collection>
  collectionOrder: string[]
  scripts: Record<string, Script>
  ui: UiState
  settings: Settings
}

export function resolvePrompterSettings(
  defaults: PrompterSettings,
  overrides: Partial<PrompterSettings> | null
): PrompterSettings {
  return { ...defaults, ...(overrides ?? {}) }
}
