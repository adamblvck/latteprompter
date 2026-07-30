import { Coffee, Settings } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'

const mac = navigator.platform.toLowerCase().includes('mac')

export default function TitleBar(): React.JSX.Element {
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)

  return (
    <header className={`titlebar${mac ? ' has-traffic-lights' : ''}`}>
      <div className="titlebar-brand">
        <span className="brand-latte">Latte</span>
        <Coffee size={15} className="brand-coffee" aria-hidden />
        <span className="brand-prompter">Prompter</span>
      </div>
      <div className="titlebar-actions">
        <button
          className="icon-btn"
          title="Settings (⌘,)"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  )
}
