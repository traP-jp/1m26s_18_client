const DEFAULT_API_BASE = "https://1m26-18.trap.show/api/v1";

const rawApiBase = import.meta.env.VITE_API_BASE ?? DEFAULT_API_BASE;

// スマホ実機確認では controller を PC の LAN IP で開くため、
// VITE_API_BASE が localhost のままだとスマホ自身を指して接続失敗する。
// ループバック指定の場合は開いているページのホスト名に置き換える
// (desktop の localhost 開きでは hostname も localhost なので無害)。
export const API_BASE = resolveLanApiBase(rawApiBase);

const explicitWebtransportHost: string | undefined = import.meta.env.VITE_WEBTRANSPORT_HOST;

export const WEBTRANSPORT_HOST = resolveLanHost(
  explicitWebtransportHost ?? deriveHostname(API_BASE),
);

function isLoopback(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1"
  );
}

function pageHostname(): string | null {
  if (typeof window === "undefined" || !window.location?.hostname) return null;
  return window.location.hostname;
}

function resolveLanApiBase(raw: string): string {
  try {
    const url = new URL(raw);
    if (isLoopback(url.hostname)) {
      const host = pageHostname();
      if (host) url.hostname = host;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return raw;
  }
}

function resolveLanHost(host: string): string {
  if (isLoopback(host)) {
    return pageHostname() ?? host;
  }
  return host;
}

function deriveHostname(apiBase: string): string {
  try {
    return new URL(apiBase).hostname;
  } catch {
    return window.location.hostname;
  }
}
