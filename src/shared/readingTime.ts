export const WORDS_PER_MINUTE = 150

/** Count speakable words in a markdown body — strips fences, links and markup first. */
export function wordCount(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~-]+/g, ' ')
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

export function readTimeMinutes(words: number): number {
  return words / WORDS_PER_MINUTE
}

/** "~2 min" style label; sub-minute scripts show seconds. */
export function readTimeLabel(words: number): string {
  const min = readTimeMinutes(words)
  if (min < 1) return `~${Math.max(5, Math.round((min * 60) / 5) * 5)} sec`
  return `~${Math.round(min)} min`
}
