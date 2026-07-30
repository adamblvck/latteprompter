import { useEffect, useState } from 'react'
import { useStore } from '@renderer/store/useStore'

export default function MicPicker(): React.JSX.Element {
  const micDeviceId = useStore((s) => s.store?.settings.asr.micDeviceId)
  const setMicDevice = useStore((s) => s.setMicDevice)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])

  useEffect(() => {
    let cancelled = false
    const enumerate = async (): Promise<void> => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices()
        if (!cancelled) setDevices(all.filter((d) => d.kind === 'audioinput'))
      } catch {
        /* enumeration unavailable */
      }
    }
    enumerate()
    navigator.mediaDevices.addEventListener('devicechange', enumerate)
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener('devicechange', enumerate)
    }
  }, [])

  return (
    <div className="set-row" style={{ marginTop: 'var(--sp-2)' }}>
      <span className="set-label">Microphone</span>
      <select
        className="select"
        value={micDeviceId ?? ''}
        onChange={(e) => setMicDevice(e.target.value || null)}
      >
        <option value="">System default</option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
          </option>
        ))}
      </select>
    </div>
  )
}
