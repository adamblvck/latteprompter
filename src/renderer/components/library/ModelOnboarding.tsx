import { useEffect, useState } from 'react'
import { AudioLines, Download, X } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { ASR_PRESETS, DEFAULT_PRESET_ID, presetById, presetTotalBytes } from '@shared/asr-models'
import type { AsrModelProgressEvent } from '@shared/ipc'

function mb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

/**
 * First-open callout: voice-following is dead until a speech model exists on
 * disk, so the library leads with a one-click download of the recommended
 * preset. Disappears the moment any preset is cached; "Not now" hides it for
 * this session only.
 */
export default function ModelOnboarding(): React.JSX.Element | null {
  const modelStatus = useStore((s) => s.modelStatus)
  const dismissed = useStore((s) => s.modelBannerDismissed)
  const dismissModelBanner = useStore((s) => s.dismissModelBanner)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)

  const [progress, setProgress] = useState<AsrModelProgressEvent | null>(null)

  useEffect(() => {
    const unsub = window.lp.asr.onModelProgress((p) => {
      setProgress(p.done || p.error ? null : p)
    })
    return unsub
  }, [])

  const anyCached = ASR_PRESETS.some((p) => modelStatus[p.id])
  if (anyCached || dismissed) return null

  const recommended = presetById(DEFAULT_PRESET_ID)!
  const downloading = progress ? presetById(progress.presetId) : null

  return (
    <div className="onboard-card">
      <div className="onboard-icon">
        <AudioLines size={20} />
      </div>
      <div className="onboard-body">
        <div className="onboard-title">Give LattePrompter its ears</div>
        {downloading && progress ? (
          <>
            <div className="onboard-text">
              Downloading {downloading.label} — the prompter unlocks the moment it lands.
            </div>
            <div className="dl-bar">
              <div
                className="dl-bar-fill"
                style={{ width: `${Math.round(progress.progress * 100)}%` }}
              />
            </div>
            <div className="model-sub">
              {mb(progress.loaded)} / {mb(progress.total)}
              {progress.file ? ` — ${progress.file}` : ''}
            </div>
          </>
        ) : (
          <div className="onboard-text">
            The prompter follows your voice with a speech model that runs entirely on this Mac.
            One download, no cloud, no account. We recommend{' '}
            <strong>{recommended.label}</strong> ({mb(presetTotalBytes(recommended))}, lowest
            latency).
          </div>
        )}
      </div>
      {!progress && (
        <div className="onboard-actions">
          <button
            className="btn accent"
            onClick={() => window.lp.asr.downloadModel(DEFAULT_PRESET_ID)}
          >
            <Download size={14} />
            Download model
          </button>
          <button className="btn" onClick={() => setSettingsOpen(true)}>
            More models…
          </button>
        </div>
      )}
      <button className="icon-btn onboard-close" title="Not now" onClick={dismissModelBanner}>
        <X size={15} />
      </button>
    </div>
  )
}
