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

  // Model downloads finish (or fail) app-wide, not per-screen: refresh the
  // cached map, adopt the model when none is selected yet, and toast once.
  useEffect(() => {
    const unsub = window.lp.asr.onModelProgress((p) => {
      const s = useStore.getState()
      if (p.done) {
        s.refreshModelStatus()
        if (s.store?.settings.asr.modelId === null) s.setAsrModel(p.presetId)
        s.showToast('Speech model ready', 'info')
      } else if (p.error && p.error !== 'cancelled') {
        s.showToast(`Download failed: ${p.error}`, 'error')
      }
    })
    return unsub
  }, [])

  // Dev/screenshot affordance: ?scene=settings|prompter jumps straight there.
  useEffect(() => {
    if (!loaded) return
    const scene = new URLSearchParams(window.location.search).get('scene')
    if (scene === 'settings' || scene === 'settings-models') {
      useStore.getState().setSettingsOpen(true)
      if (scene === 'settings-models') {
        // Bring the Speech Recognition section into frame for captures.
        setTimeout(() => {
          document.querySelector('.model-row')?.scrollIntoView({ block: 'center' })
        }, 400)
      }
    } else if (scene === 'prompter') {
      const s = useStore.getState()
      const first = Object.keys(s.store?.scripts ?? {})[0]
      if (first) s.startPrompter(first)
    }
  }, [loaded])

  if (!loaded) return null
  return <Shell />
}
