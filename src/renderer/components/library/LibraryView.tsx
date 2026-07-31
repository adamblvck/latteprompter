import { LayoutGrid, List, Plus } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import ScriptCard from './ScriptCard'
import EmptyState from './EmptyState'
import ModelOnboarding from './ModelOnboarding'

export default function LibraryView(): React.JSX.Element {
  const store = useStore((s) => s.store)
  const activeCollectionId = useStore((s) => s.activeCollectionId)
  const searchQuery = useStore((s) => s.searchQuery)
  const setSearchQuery = useStore((s) => s.setSearchQuery)
  const setLibraryView = useStore((s) => s.setLibraryView)
  const addScript = useStore((s) => s.addScript)

  if (!store) return <div className="library" />

  const collection = activeCollectionId ? store.collections[activeCollectionId] : null
  const title = collection ? collection.name : 'All Scripts'

  const q = searchQuery.trim().toLowerCase()
  const scripts = Object.values(store.scripts)
    .filter((s) => (activeCollectionId ? s.collectionId === activeCollectionId : true))
    .filter((s) => !q || s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))

  const view = store.ui.libraryView

  return (
    <div className="library">
      <div className="library-head">
        <h1 className="library-title">{title}</h1>
        <span className="library-count">{scripts.length}</span>
        <input
          className="search-input selectable"
          placeholder="Search…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button
          className="icon-btn"
          title={view === 'grid' ? 'List view' : 'Grid view'}
          onClick={() => setLibraryView(view === 'grid' ? 'list' : 'grid')}
        >
          {view === 'grid' ? <List size={15} /> : <LayoutGrid size={15} />}
        </button>
        <button className="btn accent" onClick={() => addScript(activeCollectionId)}>
          <Plus size={14} />
          New Script
        </button>
      </div>

      <ModelOnboarding />

      {scripts.length === 0 ? (
        <EmptyState
          title={q ? 'No matches' : 'No scripts yet'}
          hint={q ? 'Try a different search.' : 'Write your first script and take the stage.'}
          onAdd={q ? undefined : () => addScript(activeCollectionId)}
          addLabel="New Script"
        />
      ) : (
        <div className={view === 'grid' ? 'lib-grid' : 'lib-list'}>
          {scripts.map((script) => (
            <ScriptCard key={script.id} script={script} />
          ))}
        </div>
      )}
    </div>
  )
}
