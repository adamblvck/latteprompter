import { useEffect, useState } from 'react'
import { Check, Download, Trash2, XCircle } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { ASR_PRESETS, DEFAULT_PRESET_ID } from '@shared/asr-models'
import type { AsrModelProgressEvent } from '@shared/ipc'

function mb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

export default function AsrModelSection(): React.JSX.Element {
  const modelId = useStore((s) => s.store?.settings.asr.modelId)
  const setAsrModel = useStore((s) => s.setAsrModel)
  const showToast = useStore((s) => s.showToast)

  const [cached, setCached] = useState<Record<string, boolean>>({})
  const [progress, setProgress] = useState<Record<string, AsrModelProgressEvent>>({})

  const refresh = async (): Promise<void> => {
    const entries: Record<string, boolean> = {}
    for (const preset of ASR_PRESETS) {
      const status = await window.lp.asr.status(preset.id)
      entries[preset.id] = status.cached
    }
    setCached(entries)
  }

  useEffect(() => {
    refresh()
    const unsub = window.lp.asr.onModelProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.presetId]: p }))
      if (p.done) {
        refresh()
        setProgress((prev) => {
          const next = { ...prev }
          delete next[p.presetId]
          return next
        })
        useStore.getState().showToast('Speech model ready', 'info')
      } else if (p.error && p.error !== 'cancelled') {
        useStore.getState().showToast(`Download failed: ${p.error}`, 'error')
        setProgress((prev) => {
          const next = { ...prev }
          delete next[p.presetId]
          return next
        })
      } else if (p.error === 'cancelled') {
        setProgress((prev) => {
          const next = { ...prev }
          delete next[p.presetId]
          return next
        })
      }
    })
    return unsub
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
      {ASR_PRESETS.map((preset) => {
        const isCached = cached[preset.id] ?? false
        const p = progress[preset.id]
        const selected = (modelId ?? DEFAULT_PRESET_ID) === preset.id
        return (
          <div key={preset.id} className="model-row">
            <div className="model-row-top">
              <span className="model-name">{preset.label}</span>
              <span className="model-size">{preset.sublabel}</span>
              {isCached ? (
                <>
                  <span className="set-badge ok">
                    <Check size={10} style={{ verticalAlign: -1 }} /> Ready
                  </span>
                  {selected && <span className="set-badge">Selected</span>}
                  {!selected && (
                    <button className="btn" onClick={() => setAsrModel(preset.id)}>
                      Select
                    </button>
                  )}
                  <button
                    className="icon-btn danger"
                    title="Delete model from disk"
                    onClick={async () => {
                      await window.lp.asr.deleteModel(preset.id)
                      refresh()
                      showToast('Model deleted', 'info')
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : p ? (
                <button
                  className="icon-btn"
                  title="Cancel download"
                  onClick={() => window.lp.asr.cancelDownload(preset.id)}
                >
                  <XCircle size={15} />
                </button>
              ) : (
                <button
                  className="btn"
                  onClick={() => {
                    setProgress((prev) => ({
                      ...prev,
                      [preset.id]: {
                        presetId: preset.id,
                        file: '',
                        loaded: 0,
                        total: 1,
                        progress: 0,
                        done: false
                      }
                    }))
                    window.lp.asr.downloadModel(preset.id)
                  }}
                >
                  <Download size={13} />
                  Download
                </button>
              )}
            </div>
            {p && !p.done && (
              <>
                <div className="dl-bar">
                  <div className="dl-bar-fill" style={{ width: `${Math.round(p.progress * 100)}%` }} />
                </div>
                <div className="model-sub">
                  {mb(p.loaded)} / {mb(p.total)}
                  {p.file ? ` — ${p.file}` : ''}
                </div>
              </>
            )}
            {!isCached && !p && (
              <div className="model-sub">Downloads once, then everything runs on-device.</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
