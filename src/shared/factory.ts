import { zid, nowISO } from './id'
import type {
  Collection,
  CollectionAccent,
  PrompterSettings,
  Script,
  StoreFile
} from './types'
import { SCHEMA_VERSION } from './types'

const ACCENT_CYCLE: CollectionAccent[] = ['water', 'earth', 'air', 'akasha', 'fire']

export function defaultPrompterSettings(): PrompterSettings {
  return {
    fontId: 'atkinson',
    fontSize: 56,
    lineHeight: 1.6,
    mirror: false,
    scrollMode: 'follow',
    constantWpm: 150
  }
}

export function createScript(title: string, collectionId: string | null = null): Script {
  const now = nowISO()
  return {
    id: zid(),
    title,
    body: '',
    collectionId,
    promptOverrides: null,
    createdAt: now,
    updatedAt: now,
    lastPromptedAt: null
  }
}

export function createCollection(name: string, existingCount: number): Collection {
  const now = nowISO()
  return {
    id: zid(),
    name,
    accent: ACCENT_CYCLE[existingCount % ACCENT_CYCLE.length],
    createdAt: now,
    modifiedAt: now
  }
}

const WELCOME_BODY = `# Welcome to LattePrompter

Write your script here in **markdown**, then press *Prompt* to enter the teleprompter.

In prompter mode, LattePrompter listens to your voice and scrolls the script as you speak. Look away, skip a line, or ad-lib — it finds where you are and keeps the next words in front of your eyes.

## A few tips

- Keep sentences short. Short lines are easier to read at a distance.
- Numbers like 42 or 1984 are matched against their spoken form.
- If you go fully off script, the prompter simply waits for you to come back.

Press Escape at any time to leave the prompter.
`

export function createDefaultStore(): StoreFile {
  const welcome = createScript('Welcome to LattePrompter')
  welcome.body = WELCOME_BODY
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: nowISO(),
    collections: {},
    collectionOrder: [],
    scripts: { [welcome.id]: welcome },
    ui: { themeMode: 'dark', libraryView: 'grid', windowBounds: null },
    settings: {
      prompterDefaults: defaultPrompterSettings(),
      asr: { modelId: null, micDeviceId: null }
    }
  }
}

/** Fill any missing fields on a loaded store (defensive against hand-edited files). */
export function hydrateStore(store: StoreFile): StoreFile {
  const def = createDefaultStore()
  return {
    ...def,
    ...store,
    ui: { ...def.ui, ...(store.ui ?? {}) },
    settings: {
      prompterDefaults: {
        ...def.settings.prompterDefaults,
        ...(store.settings?.prompterDefaults ?? {})
      },
      asr: { ...def.settings.asr, ...(store.settings?.asr ?? {}) }
    },
    collections: store.collections ?? {},
    collectionOrder: store.collectionOrder ?? [],
    scripts: store.scripts ?? {}
  }
}
