import { useEffect } from 'react'
import { useStore } from '@renderer/store/useStore'
import Shell from './Shell'

export default function App(): React.JSX.Element | null {
  const loaded = useStore((s) => s.loaded)
  const load = useStore((s) => s.load)
  const themeMode = useStore((s) => s.store?.ui.themeMode)

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    document.documentElement.classList.toggle('light', themeMode === 'light')
  }, [themeMode])

  // Dev/screenshot affordance: ?scene=settings|prompter jumps straight there.
  useEffect(() => {
    if (!loaded) return
    const scene = new URLSearchParams(window.location.search).get('scene')
    if (scene === 'settings') {
      useStore.getState().setSettingsOpen(true)
    } else if (scene === 'prompter') {
      const s = useStore.getState()
      const first = Object.keys(s.store?.scripts ?? {})[0]
      if (first) s.startPrompter(first)
    }
  }, [loaded])

  if (!loaded) return null
  return <Shell />
}
