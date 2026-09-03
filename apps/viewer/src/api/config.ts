const DEFAULT_API_BASE = "https://1m26-18.trap.show/api/v1";

export const API_BASE = import.meta.env.VITE_API_BASE ?? DEFAULT_API_BASE;

export const WEBTRANSPORT_HOST =
  import.meta.env.VITE_WEBTRANSPORT_HOST ?? deriveHostname(API_BASE);

// controller アプリのベースURL。未設定時は dev 構成(viewer と同一ホストの
// ポート5174で controller が動く)を想定して window.location から導出する
export const CONTROLLER_BASE_URL =
  import.meta.env.VITE_CONTROLLER_BASE_URL ??
  `${window.location.protocol}//${window.location.hostname}:5174`;

function deriveHostname(apiBase: string): string {
  try {
    return new URL(apiBase).hostname;
  } catch {
    return window.location.hostname;
  }
}
