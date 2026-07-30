/**
 * ASR model catalog. Pure data + pure planning helpers — no fs, no network.
 * Files are hosted on HuggingFace; verification is size-equality (no checksums),
 * matching the download-to-.part + rename + Range-resume downloader.
 *
 * Two engine kinds:
 *  - 'offline-stream': an offline (non-streaming) recognizer driven as a
 *    pseudo-streamer — the worker re-decodes the current utterance window every
 *    few hundred ms and emits mutating partials. Proven, high accuracy
 *    (NeMo Parakeet TDT), ~250–500 ms partial cadence — plenty for tracking.
 *  - 'online': a true streaming recognizer (sherpa OnlineRecognizer). Kept for
 *    future presets; the 2023-era streaming zipformer exports decode garbage on
 *    current sherpa-onnx builds (verified 2026-07), so none ship by default.
 */

export interface AsrModelFile {
  name: string
  bytes: number
}

export type AsrEngineKind = 'offline-stream' | 'online'

export interface AsrPreset {
  id: string
  label: string
  sublabel: string
  repo: string
  /** Directory under userData/models/asr/ */
  dir: string
  kind: AsrEngineKind
  /** sherpa modelType hint ('' = auto-detect from model metadata). */
  modelType: string
  files: AsrModelFile[]
}

export const ASR_PRESETS: AsrPreset[] = [
  {
    id: 'nemo-streaming-en',
    label: 'FastConformer English',
    sublabel: 'English · ~460 MB · lowest latency',
    repo: 'csukuangfj/sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-80ms',
    dir: 'nemo-streaming-fast-conformer-transducer-en-80ms',
    kind: 'online',
    modelType: '',
    files: [
      { name: 'tokens.txt', bytes: 11896 },
      { name: 'decoder.onnx', bytes: 15753086 },
      { name: 'joiner.onnx', bytes: 5584034 },
      { name: 'encoder.onnx', bytes: 456772174 }
    ]
  },
  {
    id: 'parakeet-v2',
    label: 'Parakeet English',
    sublabel: 'English · ~660 MB · best accuracy',
    repo: 'csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8',
    dir: 'parakeet-tdt-0.6b-v2-int8',
    kind: 'offline-stream',
    modelType: 'nemo_transducer',
    files: [
      { name: 'tokens.txt', bytes: 9384 },
      { name: 'decoder.int8.onnx', bytes: 7257753 },
      { name: 'joiner.int8.onnx', bytes: 1739080 },
      { name: 'encoder.int8.onnx', bytes: 652184296 }
    ]
  },
  {
    id: 'parakeet-v3',
    label: 'Parakeet Multilingual',
    sublabel: '25 European languages · ~670 MB',
    repo: 'csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
    dir: 'parakeet-tdt-0.6b-v3-int8',
    kind: 'offline-stream',
    modelType: 'nemo_transducer',
    files: [
      { name: 'tokens.txt', bytes: 93939 },
      { name: 'decoder.int8.onnx', bytes: 11845275 },
      { name: 'joiner.int8.onnx', bytes: 6355277 },
      { name: 'encoder.int8.onnx', bytes: 652184281 }
    ]
  }
]

export const DEFAULT_PRESET_ID = ASR_PRESETS[0].id

export function presetById(id: string): AsrPreset | undefined {
  return ASR_PRESETS.find((p) => p.id === id)
}

export function fileUrl(preset: AsrPreset, name: string): string {
  return `https://huggingface.co/${preset.repo}/resolve/main/${name}`
}

export function presetTotalBytes(preset: AsrPreset): number {
  return preset.files.reduce((sum, f) => sum + f.bytes, 0)
}

export interface DownloadPlan {
  missing: AsrModelFile[]
  doneBytes: number
  totalBytes: number
  complete: boolean
}

/**
 * Compute what still needs downloading. `sizeOf(name)` returns the on-disk size
 * of a model file (or null when absent) — injected so this stays pure/testable.
 */
export function downloadPlan(
  preset: AsrPreset,
  sizeOf: (name: string) => number | null
): DownloadPlan {
  const missing: AsrModelFile[] = []
  let doneBytes = 0
  for (const f of preset.files) {
    const size = sizeOf(f.name)
    if (size === f.bytes) doneBytes += f.bytes
    else missing.push(f)
  }
  return {
    missing,
    doneBytes,
    totalBytes: presetTotalBytes(preset),
    complete: missing.length === 0
  }
}

/** sherpa-onnx recognizer config for a preset rooted at modelDir. */
export function recognizerConfig(preset: AsrPreset, modelDir: string, numThreads = 2) {
  const p = (name: string) => `${modelDir}/${name}`
  const find = (part: string) => preset.files.find((f) => f.name.startsWith(part))!.name
  return {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: p(find('encoder')),
        decoder: p(find('decoder')),
        joiner: p(find('joiner'))
      },
      tokens: p('tokens.txt'),
      numThreads,
      provider: 'cpu',
      ...(preset.modelType ? { modelType: preset.modelType } : {}),
      debug: 0
    },
    ...(preset.kind === 'online'
      ? {
          decodingMethod: 'greedy_search',
          enableEndpoint: true,
          rule1MinTrailingSilence: 2.4,
          rule2MinTrailingSilence: 1.0,
          rule3MinUtteranceLength: 20
        }
      : {})
  }
}
