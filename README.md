# LattePrompter

**A teleprompter that follows your voice.**

Write your script in markdown, organize scripts into collections, then step into
prompter mode: LattePrompter transcribes your speech on-device in real time and
scrolls the script as you speak — highlighting the word you're on, surviving
skipped lines, ad-libs, and pauses. Look away, come back, and it finds you.

Everything runs locally. Audio never leaves your machine.

## Features

- **Voice-following scroll** — on-device streaming speech recognition
  (sherpa-onnx, NVIDIA NeMo FastConformer / Parakeet models) drives a fuzzy
  script aligner that tracks your position word by word
- **Robust tracking** — handles skipped sentences, restarted lines, off-script
  rambling, spoken numbers ("1984" ↔ "nineteen eighty four"), and silence
- **Classic modes too** — constant-speed scroll (wpm) and manual scroll
- **Reading typography** — bundled Atkinson Hyperlegible, Inter, Literata, and
  OpenDyslexic; live font size and line-height controls; mirror mode for
  beam-splitter rigs
- **Script library** — markdown scripts in color-coded collections, word count
  and estimated read time, per-script prompter overrides
- **One-time model download** — models fetched from HuggingFace on first use
  with resumable downloads, then fully offline

## Install

Grab the latest build for macOS, Windows, or Linux from
[Releases](https://github.com/adamblvck/latteprompter/releases).

## Development

```bash
npm install
npm run dev
```

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm run dev` | Run with hot reload |
| `npm test` | Unit tests (script parser, aligner, store) |
| `npm run typecheck` | TypeScript across main + renderer |
| `npm run asr:harness` | Build, then validate the speech engine end-to-end with synthesized speech |
| `npm run dist` | Package for the current platform |

### Architecture

```
src/shared     pure TypeScript: data model, markdown → word-index parser,
               number expansion, the ScriptAligner (all unit-tested)
src/main       Electron main: window, atomic JSON store, model downloader,
               ASR engine lifecycle (utilityProcess)
src/main/asr-worker.ts   sherpa-onnx recognizer host (streaming + pseudo-streaming)
src/renderer   React UI: library, editor, settings, prompter stage
```

The heart is `src/shared/aligner.ts`: a deterministic matcher that consumes
mutating ASR partials and emits `{ committed, tentative, confidence, state }`
against the script's word index — greedy local matching with a windowed
re-anchor for jumps, stable-prefix checkpointing for partial revisions.

## License

[MIT](LICENSE) © Blvck Studios. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled fonts and models.
