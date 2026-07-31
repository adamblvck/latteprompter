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
  const modelStatus = useStore((s) => s.modelStatus)
  const setAsrModel = useStore((s) => s.setAsrModel)
  const refreshModelStatus = useStore((s) => s.refreshModelStatus)
  const showToast = useStore((s) => s.showToast)

  const [progress, setProgress] = useState<Record<string, AsrModelProgressEvent>>({})

  useEffect(() => {
    refreshModelStatus()
    // Completion/failure toasts and cached-map refresh happen app-wide in
    // App.tsx; this listener only drives the per-row progress bars.
    const unsub = window.lp.asr.onModelProgress((p) => {
      setProgress((prev) => {
        if (p.done || p.error) {
          const next = { ...prev }
          delete next[p.presetId]
          return next
        }
        return { ...prev, [p.presetId]: p }
      })
    })
    return unsub
  }, [refreshModelStatus])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
      {ASR_PRESETS.map((preset) => {
        const isCached = modelStatus[preset.id] ?? false
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
                      refreshModelStatus()
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
