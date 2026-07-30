import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type {
  PrompterSettings,
  Script,
  StoreFile,
  ThemeMode,
  ViewMode,
  WindowBounds
} from '@shared/types'
import { createCollection, createScript } from '@shared/factory'
import { nowISO, zid } from '@shared/id'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  separatorBefore?: boolean
}

export interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

export interface ToastState {
  id: number
  message: string
  tone: 'info' | 'warn' | 'error'
}

export type View = { name: 'library' } | { name: 'editor'; scriptId: string }

export interface AppState {
  store: StoreFile | null
  loaded: boolean

  // navigation (transient)
  view: View
  activeCollectionId: string | null
  prompterScriptId: string | null
  settingsOpen: boolean
  searchQuery: string

  // transient UI
  contextMenu: ContextMenuState | null
  toast: ToastState | null
  renamingCollectionId: string | null

  // lifecycle
  load: () => Promise<void>
  applyBounds: (bounds: WindowBounds) => void

  // navigation
  openEditor: (scriptId: string) => void
  closeEditor: () => void
  setActiveCollection: (id: string | null) => void
  setSettingsOpen: (open: boolean) => void
  setSearchQuery: (q: string) => void
  startPrompter: (scriptId: string) => void
  exitPrompter: () => void

  // scripts
  addScript: (collectionId: string | null) => string
  updateScriptTitle: (id: string, title: string) => void
  updateScriptBody: (id: string, body: string) => void
  duplicateScript: (id: string) => void
  deleteScript: (id: string) => Promise<void>
  moveScriptToCollection: (id: string, collectionId: string | null) => void
  updateScriptOverrides: (id: string, overrides: Partial<PrompterSettings> | null) => void

  // collections
  addCollection: () => void
  renameCollection: (id: string, name: string) => void
  setRenamingCollection: (id: string | null) => void
  deleteCollection: (id: string) => Promise<void>

  // settings
  setThemeMode: (mode: ThemeMode) => void
  setLibraryView: (view: ViewMode) => void
  updatePrompterDefaults: (patch: Partial<PrompterSettings>) => void
  setAsrModel: (modelId: string | null) => void
  setMicDevice: (deviceId: string | null) => void

  // ui singletons
  openContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void
  closeContextMenu: () => void
  showToast: (message: string, tone?: ToastState['tone']) => void
  clearToast: () => void
}

let toastCounter = 0

export const useStore = create<AppState>()(
  subscribeWithSelector(
    immer((set, get) => ({
      store: null,
      loaded: false,
      view: { name: 'library' },
      activeCollectionId: null,
      prompterScriptId: null,
      settingsOpen: false,
      searchQuery: '',
      contextMenu: null,
      toast: null,
      renamingCollectionId: null,

      load: async () => {
        const store = await window.lp.store.load()
        set((s) => {
          s.store = store
          s.loaded = true
        })
      },

      applyBounds: (bounds) =>
        set((s) => {
          if (s.store) s.store.ui.windowBounds = bounds
        }),

      openEditor: (scriptId) => set((s) => void (s.view = { name: 'editor', scriptId })),
      closeEditor: () => set((s) => void (s.view = { name: 'library' })),
      setActiveCollection: (id) =>
        set((s) => {
          s.activeCollectionId = id
          s.view = { name: 'library' }
        }),
      setSettingsOpen: (open) => set((s) => void (s.settingsOpen = open)),
      setSearchQuery: (q) => set((s) => void (s.searchQuery = q)),

      startPrompter: (scriptId) => {
        set((s) => {
          s.prompterScriptId = scriptId
          const script = s.store?.scripts[scriptId]
          if (script) script.lastPromptedAt = nowISO()
        })
        window.lp.window.setFullScreen(true).catch(() => {})
      },
      exitPrompter: () => {
        set((s) => void (s.prompterScriptId = null))
        window.lp.window.setFullScreen(false).catch(() => {})
        window.lp.asr.stop().catch(() => {})
      },

      addScript: (collectionId) => {
        const script = createScript('Untitled Script', collectionId)
        set((s) => {
          if (!s.store) return
          s.store.scripts[script.id] = script
          s.view = { name: 'editor', scriptId: script.id }
        })
        return script.id
      },

      updateScriptTitle: (id, title) =>
        set((s) => {
          const script = s.store?.scripts[id]
          if (script) {
            script.title = title
            script.updatedAt = nowISO()
          }
        }),

      updateScriptBody: (id, body) =>
        set((s) => {
          const script = s.store?.scripts[id]
          if (script) {
            script.body = body
            script.updatedAt = nowISO()
          }
        }),

      duplicateScript: (id) =>
        set((s) => {
          const src = s.store?.scripts[id]
          if (!s.store || !src) return
          const copy: Script = {
            ...src,
            id: zid(),
            title: `${src.title} copy`,
            createdAt: nowISO(),
            updatedAt: nowISO(),
            lastPromptedAt: null
          }
          s.store.scripts[copy.id] = copy
        }),

      deleteScript: async (id) => {
        const script = get().store?.scripts[id]
        if (!script) return
        const { confirmed } = await window.lp.dialog.confirm({
          title: `Delete “${script.title}”?`,
          message: 'This removes the script permanently.',
          confirmLabel: 'Delete',
          danger: true
        })
        if (!confirmed) return
        set((s) => {
          if (!s.store) return
          delete s.store.scripts[id]
          if (s.view.name === 'editor' && s.view.scriptId === id) s.view = { name: 'library' }
        })
      },

      moveScriptToCollection: (id, collectionId) =>
        set((s) => {
          const script = s.store?.scripts[id]
          if (script) {
            script.collectionId = collectionId
            script.updatedAt = nowISO()
          }
        }),

      updateScriptOverrides: (id, overrides) =>
        set((s) => {
          const script = s.store?.scripts[id]
          if (script) script.promptOverrides = overrides
        }),

      addCollection: () => {
        set((s) => {
          if (!s.store) return
          const col = createCollection('New Collection', s.store.collectionOrder.length)
          s.store.collections[col.id] = col
          s.store.collectionOrder.push(col.id)
          s.renamingCollectionId = col.id
          s.activeCollectionId = col.id
        })
      },

      renameCollection: (id, name) =>
        set((s) => {
          const col = s.store?.collections[id]
          if (col && name.trim()) {
            col.name = name.trim()
            col.modifiedAt = nowISO()
          }
          s.renamingCollectionId = null
        }),

      setRenamingCollection: (id) => set((s) => void (s.renamingCollectionId = id)),

      deleteCollection: async (id) => {
        const col = get().store?.collections[id]
        if (!col) return
        const { confirmed } = await window.lp.dialog.confirm({
          title: `Delete “${col.name}”?`,
          message: 'Scripts inside are kept and moved to All Scripts.',
          confirmLabel: 'Delete',
          danger: true
        })
        if (!confirmed) return
        set((s) => {
          if (!s.store) return
          delete s.store.collections[id]
          s.store.collectionOrder = s.store.collectionOrder.filter((c) => c !== id)
          for (const script of Object.values(s.store.scripts)) {
            if (script.collectionId === id) script.collectionId = null
          }
          if (s.activeCollectionId === id) s.activeCollectionId = null
        })
      },

      setThemeMode: (mode) =>
        set((s) => {
          if (s.store) s.store.ui.themeMode = mode
        }),

      setLibraryView: (view) =>
        set((s) => {
          if (s.store) s.store.ui.libraryView = view
        }),

      updatePrompterDefaults: (patch) =>
        set((s) => {
          if (s.store) Object.assign(s.store.settings.prompterDefaults, patch)
        }),

      setAsrModel: (modelId) =>
        set((s) => {
          if (s.store) s.store.settings.asr.modelId = modelId
        }),

      setMicDevice: (deviceId) =>
        set((s) => {
          if (s.store) s.store.settings.asr.micDeviceId = deviceId
        }),

      openContextMenu: (x, y, items) => set((s) => void (s.contextMenu = { x, y, items })),
      closeContextMenu: () => set((s) => void (s.contextMenu = null)),

      showToast: (message, tone = 'info') =>
        set((s) => void (s.toast = { id: ++toastCounter, message, tone })),
      clearToast: () => set((s) => void (s.toast = null))
    }))
  )
)
