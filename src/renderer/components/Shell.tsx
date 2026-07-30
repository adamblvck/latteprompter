import { useEffect } from 'react'
import { useStore } from '@renderer/store/useStore'
import TitleBar from './TitleBar'
import Sidebar from './Sidebar'
import LibraryView from './library/LibraryView'
import EditorView from './editor/EditorView'
import SettingsOverlay from './settings/SettingsOverlay'
import PrompterView from './prompter/PrompterView'
import ContextMenu from './ContextMenu'
import Toast from './Toast'

export default function Shell(): React.JSX.Element {
  const view = useStore((s) => s.view)
  const settingsOpen = useStore((s) => s.settingsOpen)
  const prompterScriptId = useStore((s) => s.prompterScriptId)

  // Global keyboard handling with an Escape stack: contextMenu → prompter →
  // settings → renaming → search → editor.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      const mod = e.metaKey || e.ctrlKey

      if (e.key === 'Escape') {
        if (s.contextMenu) return void s.closeContextMenu()
        if (s.prompterScriptId) return void s.exitPrompter()
        if (s.settingsOpen) return void s.setSettingsOpen(false)
        if (s.renamingCollectionId) return void s.setRenamingCollection(null)
        if (s.searchQuery) return void s.setSearchQuery('')
        if (s.view.name === 'editor') return void s.closeEditor()
        return
      }

      if (s.prompterScriptId) return // prompter owns all other keys

      if (mod && e.key === 'n' && !e.shiftKey) {
        e.preventDefault()
        s.addScript(s.activeCollectionId)
        return
      }
      if (mod && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault()
        s.addCollection()
        return
      }
      if (mod && e.key === ',') {
        e.preventDefault()
        s.setSettingsOpen(!s.settingsOpen)
        return
      }
      if (mod && e.key === 'Enter' && s.view.name === 'editor') {
        e.preventDefault()
        s.startPrompter(s.view.scriptId)
        return
      }
      if (mod && e.key === 'f') {
        e.preventDefault()
        const el = document.querySelector<HTMLInputElement>('.search-input')
        el?.focus()
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="shell">
      <TitleBar />
      <div className="shell-split">
        <Sidebar />
        <div className="shell-main">
          {view.name === 'editor' ? <EditorView scriptId={view.scriptId} /> : <LibraryView />}
        </div>
      </div>
      {settingsOpen && <SettingsOverlay />}
      {prompterScriptId && <PrompterView scriptId={prompterScriptId} />}
      <ContextMenu />
      <Toast />
    </div>
  )
}
