/// <reference types="vite/client" />
import type { OasisApi } from '../../shared/ipc'

declare global {
  interface Window {
    oasis: OasisApi
  }
}

export {}
