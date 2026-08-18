/// <reference types="vite/client" />

declare const __BUILD_TIME__: string;
declare const __BUILD_NUMBER__: string;

declare module 'virtual:pwa-register' {
  export function registerSW(options?: { immediate?: boolean }): (reloadPage?: boolean) => Promise<void>;
}
