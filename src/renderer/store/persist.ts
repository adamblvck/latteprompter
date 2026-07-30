import { useStore } from './useStore'

let timer: ReturnType<typeof setTimeout> | null = null

/** Debounced whole-store persistence + window geometry pickup. */
export function initPersistence(): void {
  useStore.subscribe(
    (s) => s.store,
    (store) => {
      if (!store) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        window.lp.store.save(store).catch((err) => {
          console.error('store save failed', err)
          useStore.getState().showToast('Saving failed — check disk space', 'error')
        })
      }, 400)
    }
  )

  window.lp.window.onBoundsChanged((bounds) => {
    useStore.getState().applyBounds(bounds)
  })
}
