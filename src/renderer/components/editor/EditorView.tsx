import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, Play, SlidersHorizontal } from 'lucide-react'
import { useStore } from '@renderer/store/useStore'
import { wordCount, readTimeLabel } from '@shared/readingTime'
import { relativeTime } from '@renderer/lib/relativeTime'
import OverridesPopover from './OverridesPopover'

export default function EditorView({ scriptId }: { scriptId: string }): React.JSX.Element | null {
  const script = useStore((s) => s.store?.scripts[scriptId])
  const closeEditor = useStore((s) => s.closeEditor)
  const updateScriptTitle = useStore((s) => s.updateScriptTitle)
  const updateScriptBody = useStore((s) => s.updateScriptBody)
  const startPrompter = useStore((s) => s.startPrompter)

  const [overridesOpen, setOverridesOpen] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Borderless auto-growing textarea: height follows content, page scrolls.
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [script?.body])

  if (!script) return null
  const words = wordCount(script.body)

  return (
    <div className="editor">
      <div className="editor-head">
        <button className="icon-btn" title="Back to library (Esc)" onClick={closeEditor}>
          <ChevronLeft size={16} />
        </button>
        <input
          className="editor-title selectable"
          value={script.title}
          placeholder="Untitled Script"
          onChange={(e) => updateScriptTitle(scriptId, e.target.value)}
        />
        <button
          className="icon-btn"
          title="Prompter settings for this script"
          onClick={() => setOverridesOpen((o) => !o)}
        >
          <SlidersHorizontal size={15} />
        </button>
        <button className="btn accent" onClick={() => startPrompter(scriptId)} title="⌘Enter">
          <Play size={14} />
          Prompt
        </button>
      </div>

      {overridesOpen && (
        <OverridesPopover scriptId={scriptId} onClose={() => setOverridesOpen(false)} />
      )}

      <div className="editor-scroll">
        <textarea
          ref={bodyRef}
          className="editor-body selectable"
          value={script.body}
          placeholder="Write your script in markdown…"
          onChange={(e) => updateScriptBody(scriptId, e.target.value)}
          spellCheck
        />
      </div>

      <div className="editor-foot">
        <span>{words} words</span>
        <span>·</span>
        <span>{readTimeLabel(words)}</span>
        <span className="spacer" />
        <span>edited {relativeTime(script.updatedAt)}</span>
      </div>
    </div>
  )
}
