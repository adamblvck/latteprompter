import type { Script } from '@shared/types'
import { useStore } from '@renderer/store/useStore'
import { wordCount, readTimeLabel } from '@shared/readingTime'
import { relativeTime } from '@renderer/lib/relativeTime'

export default function ScriptCard({ script }: { script: Script }): React.JSX.Element {
  const store = useStore((s) => s.store)
  const openEditor = useStore((s) => s.openEditor)
  const startPrompter = useStore((s) => s.startPrompter)
  const duplicateScript = useStore((s) => s.duplicateScript)
  const deleteScript = useStore((s) => s.deleteScript)
  const moveScriptToCollection = useStore((s) => s.moveScriptToCollection)
  const openContextMenu = useStore((s) => s.openContextMenu)

  const collection = script.collectionId ? store?.collections[script.collectionId] : null
  const accent = collection ? `var(--${collection.accent})` : 'var(--text-hint)'
  const words = wordCount(script.body)
  const preview = script.body.replace(/[#>*_`-]+/g, ' ').replace(/\s+/g, ' ').trim()

  return (
    <button
      className="script-card"
      style={{ ['--el' as string]: accent } as React.CSSProperties}
      onClick={() => openEditor(script.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        const collections = store ? store.collectionOrder.map((id) => store.collections[id]) : []
        openContextMenu(e.clientX, e.clientY, [
          { label: 'Prompt', onClick: () => startPrompter(script.id) },
          { label: 'Duplicate', onClick: () => duplicateScript(script.id) },
          ...(collections.length > 0
            ? [
                {
                  label: script.collectionId ? 'Move to All Scripts' : 'Move to…',
                  separatorBefore: true,
                  onClick: () => {
                    if (script.collectionId) moveScriptToCollection(script.id, null)
                  }
                },
                ...collections
                  .filter((c) => c && c.id !== script.collectionId)
                  .map((c) => ({
                    label: `→ ${c.name}`,
                    onClick: () => moveScriptToCollection(script.id, c.id)
                  }))
              ]
            : []),
          { label: 'Delete', danger: true, separatorBefore: true, onClick: () => deleteScript(script.id) }
        ])
      }}
    >
      <div className="script-card-title">{script.title}</div>
      <div className="script-card-preview">{preview || 'Empty script'}</div>
      <div className="script-card-meta">
        <span>{words} words</span>
        <span>·</span>
        <span>{readTimeLabel(words)}</span>
        <span>·</span>
        <span>{relativeTime(script.updatedAt)}</span>
      </div>
    </button>
  )
}
