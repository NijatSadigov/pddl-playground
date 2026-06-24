/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional URL of the epistemic-planning backend (Phase 2). When set at build
   * time, epistemic (PDKBDDL) problems can be solved on the server. When unset,
   * the app stays fully offline and epistemic mode is explain-only.
   */
  readonly VITE_EPISTEMIC_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
