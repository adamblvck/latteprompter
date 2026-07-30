import { useStore } from '@renderer/store/useStore'
import { resolvePrompterSettings } from '@shared/types'
import { PROMPTER_FONTS } from '@shared/fonts'

/**
 * Per-script prompter overrides — sparse patch over the global defaults.
 * Rendered as a slim inline panel under the editor header.
 */
export default function OverridesPopover({
  scriptId,
  onClose
}: {
  scriptId: string
  onClose: () => void
}): React.JSX.Element | null {
  const script = useStore((s) => s.store?.scripts[scriptId])
  const defaults = useStore((s) => s.store?.settings.prompterDefaults)
  const updateScriptOverrides = useStore((s) => s.updateScriptOverrides)

  if (!script || !defaults) return null
  const resolved = resolvePrompterSettings(defaults, script.promptOverrides)

  const patch = (p: Partial<typeof resolved>): void => {
    updateScriptOverrides(scriptId, { ...(script.promptOverrides ?? {}), ...p })
  }

  return (
    <div
      style={{
        padding: 'var(--sp-3) var(--sp-5)',
        borderBottom: '1px solid var(--card-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-4)',
        flexWrap: 'wrap'
      }}
    >
      <div className="set-seg">
        {PROMPTER_FONTS.map((f) => (
          <button
            key={f.id}
            className={`set-seg-btn${resolved.fontId === f.id ? ' on' : ''}`}
            style={{ fontFamily: f.cssFamily }}
            onClick={() => patch({ fontId: f.id })}
          >
            {f.label.split(' ')[0]}
          </button>
        ))}
      </div>

      <div className="set-slider" style={{ minWidth: 160 }}>
        <input
          type="range"
          min={24}
          max={120}
          value={resolved.fontSize}
          onChange={(e) => patch({ fontSize: Number(e.target.value) })}
        />
        <span className="set-value">{resolved.fontSize}px</span>
      </div>

      <button
        className={`set-seg-btn${resolved.mirror ? ' on' : ''}`}
        style={{ border: '1px solid var(--card-border)', borderRadius: 'var(--radius-pill)' }}
        onClick={() => patch({ mirror: !resolved.mirror })}
      >
        Mirror
      </button>

      {script.promptOverrides && (
        <button
          className="side-add"
          onClick={() => {
            updateScriptOverrides(scriptId, null)
            onClose()
          }}
        >
          Reset to defaults
        </button>
      )}
    </div>
  )
}
