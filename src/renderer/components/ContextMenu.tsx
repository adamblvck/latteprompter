import { useEffect, useRef } from 'react'
import { useStore } from '@renderer/store/useStore'

export default function ContextMenu(): React.JSX.Element | null {
  const menu = useStore((s) => s.contextMenu)
  const close = useStore((s) => s.closeContextMenu)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('blur', close)
    }
  }, [menu, close])

  if (!menu) return null

  // Keep the menu on screen.
  const width = 200
  const itemH = 32
  const x = Math.min(menu.x, window.innerWidth - width - 8)
  const y = Math.min(menu.y, window.innerHeight - menu.items.length * itemH - 16)

  return (
    <div ref={ref} className="ctx" style={{ left: x, top: y }}>
      {menu.items.map((item, i) => (
        <div key={i}>
          {item.separatorBefore && <div className="ctx-sep" />}
          <button
            className={`ctx-item${item.danger ? ' danger' : ''}`}
            onClick={() => {
              close()
              item.onClick()
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
