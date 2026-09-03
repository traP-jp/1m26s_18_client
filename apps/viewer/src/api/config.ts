const DEFAULT_API_BASE = "https://1m26-18.trap.show/api/v1";

export const API_BASE = import.meta.env.VITE_API_BASE ?? DEFAULT_API_BASE;

export const WEBTRANSPORT_HOST =
  import.meta.env.VITE_WEBTRANSPORT_HOST ?? deriveHostname(API_BASE);

function deriveHostname(apiBase: string): string {
  try {
    return new URL(apiBase).hostname;
  } catch {
    return window.location.hostname;
  }
}
