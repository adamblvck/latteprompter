import { Moon, Sun, X, FlipHorizontal2, Rabbit, Hand, AudioLines } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { PROMPTER_FONTS } from '@shared/fonts'
import AsrModelSection from './AsrModelSection'
import MicPicker from './MicPicker'

function Section({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="set-section">
      <div className="section-label" style={{ paddingLeft: 0 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

export default function SettingsOverlay(): React.JSX.Element | null {
  const store = useStore((s) => s.store)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const setThemeMode = useStore((s) => s.setThemeMode)
  const updatePrompterDefaults = useStore((s) => s.updatePrompterDefaults)
  const showToast = useStore((s) => s.showToast)

  if (!store) return null
  const d = store.settings.prompterDefaults

  return (
    <div className="overlay">
      <div className="overlay-head">
        <h2>Settings</h2>
        <button className="icon-btn" onClick={() => setSettingsOpen(false)} title="Close (Esc)">
          <X size={16} />
        </button>
      </div>
      <div className="overlay-body">
        <Section label="Appearance">
          <div className="set-row">
            <span className="set-label">Theme</span>
            <div className="set-seg">
              <button
                className={`set-seg-btn${store.ui.themeMode === 'dark' ? ' on' : ''}`}
                onClick={() => setThemeMode('dark')}
              >
                <Moon size={13} /> Dark
              </button>
              <button
                className={`set-seg-btn${store.ui.themeMode === 'light' ? ' on' : ''}`}
                onClick={() => setThemeMode('light')}
              >
                <Sun size={13} /> Light
              </button>
            </div>
          </div>
        </Section>

        <Section label="Prompter Defaults">
          <div className="set-row stack">
            <span className="set-label">Reading font</span>
            <div className="font-picker">
              {PROMPTER_FONTS.map((f) => (
                <button
                  key={f.id}
                  className={`font-option${d.fontId === f.id ? ' on' : ''}`}
                  onClick={() => updatePrompterDefaults({ fontId: f.id })}
                >
                  <span className="font-name" style={{ fontFamily: f.cssFamily }}>
                    {f.label}
                  </span>
                  <span className="font-preview" style={{ fontFamily: f.cssFamily }}>
                    The quick brown fox jumps over the lazy dog
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="set-row">
            <span className="set-label">Font size</span>
            <div className="set-slider">
              <input
                type="range"
                min={24}
                max={120}
                value={d.fontSize}
                onChange={(e) => updatePrompterDefaults({ fontSize: Number(e.target.value) })}
              />
              <span className="set-value">{d.fontSize}px</span>
            </div>
          </div>

          <div className="set-row">
            <span className="set-label">Line height</span>
            <div className="set-slider">
              <input
                type="range"
                min={12}
                max={22}
                value={Math.round(d.lineHeight * 10)}
                onChange={(e) =>
                  updatePrompterDefaults({ lineHeight: Number(e.target.value) / 10 })
                }
              />
              <span className="set-value">{d.lineHeight.toFixed(1)}</span>
            </div>
          </div>

          <div className="set-row">
            <span className="set-label">Mirror (beam-splitter glass)</span>
            <div className="set-seg">
              <button
                className={`set-seg-btn${!d.mirror ? ' on' : ''}`}
                onClick={() => updatePrompterDefaults({ mirror: false })}
              >
                Off
              </button>
              <button
                className={`set-seg-btn${d.mirror ? ' on' : ''}`}
                onClick={() => updatePrompterDefaults({ mirror: true })}
              >
                <FlipHorizontal2 size={13} /> On
              </button>
            </div>
          </div>

          <div className="set-row">
            <span className="set-label">Scroll mode</span>
            <div className="set-seg">
              <button
                className={`set-seg-btn${d.scrollMode === 'follow' ? ' on' : ''}`}
                onClick={() => updatePrompterDefaults({ scrollMode: 'follow' })}
                title="Follows your voice"
              >
                <AudioLines size={13} /> Follow
              </button>
              <button
                className={`set-seg-btn${d.scrollMode === 'constant' ? ' on' : ''}`}
                onClick={() => updatePrompterDefaults({ scrollMode: 'constant' })}
                title="Classic fixed-speed scroll"
              >
                <Rabbit size={13} /> Constant
              </button>
              <button
                className={`set-seg-btn${d.scrollMode === 'manual' ? ' on' : ''}`}
                onClick={() => updatePrompterDefaults({ scrollMode: 'manual' })}
                title="Arrow keys and wheel only"
              >
                <Hand size={13} /> Manual
              </button>
            </div>
          </div>

          {d.scrollMode === 'constant' && (
            <div className="set-row">
              <span className="set-label">Constant speed</span>
              <div className="set-slider">
                <input
                  type="range"
                  min={80}
                  max={260}
                  value={d.constantWpm}
                  onChange={(e) => updatePrompterDefaults({ constantWpm: Number(e.target.value) })}
                />
                <span className="set-value">{d.constantWpm} wpm</span>
              </div>
            </div>
          )}
        </Section>

        <Section label="Speech Recognition">
          <AsrModelSection />
          <MicPicker />
        </Section>

        <Section label="Data">
          <div className="set-row">
            <span className="set-label">Scripts &amp; settings folder</span>
            <button
              className="btn"
              onClick={async () => {
                const { path } = await window.lp.store.reveal()
                showToast(path, 'info')
              }}
            >
              Reveal
            </button>
          </div>
        </Section>

        <Section label="About">
          <div className="set-row">
            <span className="set-label">LattePrompter — an AI teleprompter that follows your voice.</span>
            <button
              className="btn"
              onClick={() => window.lp.shell.openExternal('https://github.com/adamblvck/latteprompter')}
            >
              GitHub
            </button>
          </div>
        </Section>
      </div>
    </div>
  )
}
