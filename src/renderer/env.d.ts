/// <reference types="vite/client" />
import type { LPApi } from '@shared/ipc'

declare global {
  interface Window {
    lp: LPApi
  }
}

export {}
