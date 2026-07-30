import { Plus } from 'lucide-react'

export default function EmptyState({
  title,
  hint,
  onAdd,
  addLabel
}: {
  title: string
  hint: string
  onAdd?: () => void
  addLabel?: string
}): React.JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      <div>{hint}</div>
      {onAdd && (
        <button className="btn accent" style={{ marginTop: 12 }} onClick={onAdd}>
          <Plus size={14} />
          {addLabel ?? 'New'}
        </button>
      )}
    </div>
  )
}
