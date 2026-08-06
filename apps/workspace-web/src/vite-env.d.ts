/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_E2B_ENABLED: string
  readonly VITE_NEXT_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
