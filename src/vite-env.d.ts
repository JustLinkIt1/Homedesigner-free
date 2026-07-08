/// <reference types="vite/client" />

declare module '*?url' {
  const src: string;
  export default src;
}

/** package.json version, injected by Vite `define` (see vite.config.ts). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_REFERRAL_API?: string;
  readonly VITE_REVENUECAT_ANDROID_KEY?: string;
}
