/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface HTMLAudioElement {
  webkitPreservesPitch?: boolean;
  preservesPitch: boolean;
  playsInline: boolean;
}

interface Navigator {
  standalone?: boolean;
}
