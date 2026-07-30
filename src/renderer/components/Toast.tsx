import { useEffect } from 'react'
import { useStore } from '@renderer/store/useStore'

export default function Toast(): React.JSX.Element | null {
  const toast = useStore((s) => s.toast)
  const clear = useStore((s) => s.clearToast)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clear, 2800)
    return () => clearTimeout(t)
  }, [toast, clear])

  if (!toast) return null
  return <div className={`toast ${toast.tone}`}>{toast.message}</div>
}
