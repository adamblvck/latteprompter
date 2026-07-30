import { useEffect, useRef } from 'react'
import { Library, Plus } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'

export default function Sidebar(): React.JSX.Element {
  const store = useStore((s) => s.store)
  const activeCollectionId = useStore((s) => s.activeCollectionId)
  const setActiveCollection = useStore((s) => s.setActiveCollection)
  const addCollection = useStore((s) => s.addCollection)
  const renamingCollectionId = useStore((s) => s.renamingCollectionId)
  const renameCollection = useStore((s) => s.renameCollection)
  const setRenamingCollection = useStore((s) => s.setRenamingCollection)
  const deleteCollection = useStore((s) => s.deleteCollection)
  const openContextMenu = useStore((s) => s.openContextMenu)

  const renameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (renamingCollectionId) {
      renameRef.current?.focus()
      renameRef.current?.select()
    }
  }, [renamingCollectionId])

  if (!store) return <aside className="sidebar" />

  const scripts = Object.values(store.scripts)
  const totalCount = scripts.length

  return (
    <aside className="sidebar">
      <button
        className={`side-row${activeCollectionId === null ? ' active' : ''}`}
        onClick={() => setActiveCollection(null)}
      >
        <Library size={14} />
        <span className="side-name">All Scripts</span>
        <span className="side-count">{totalCount}</span>
      </button>

      <div className="section-label">Collections</div>

      {store.collectionOrder.map((id) => {
        const col = store.collections[id]
        if (!col) return null
        const count = scripts.filter((s) => s.collectionId === id).length
        const renaming = renamingCollectionId === id
        return (
          <button
            key={id}
            className={`side-row${activeCollectionId === id ? ' active' : ''}`}
            style={{ ['--el' as string]: `var(--${col.accent})` } as React.CSSProperties}
            onClick={() => setActiveCollection(id)}
            onDoubleClick={() => setRenamingCollection(id)}
            onContextMenu={(e) => {
              e.preventDefault()
              openContextMenu(e.clientX, e.clientY, [
                { label: 'Rename', onClick: () => setRenamingCollection(id) },
                {
                  label: 'Delete',
                  danger: true,
                  separatorBefore: true,
                  onClick: () => deleteCollection(id)
                }
              ])
            }}
          >
            <span className="side-dot" />
            {renaming ? (
              <input
                ref={renameRef}
                className="side-rename selectable"
                defaultValue={col.name}
                onBlur={(e) => renameCollection(id, e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') renameCollection(id, e.currentTarget.value)
                  if (e.key === 'Escape') setRenamingCollection(null)
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="side-name">{col.name}</span>
            )}
            <span className="side-count">{count}</span>
          </button>
        )
      })}

      <button className="side-add" onClick={addCollection}>
        <Plus size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
        New Collection
      </button>
    </aside>
  )
}
