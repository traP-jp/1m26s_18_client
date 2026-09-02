/**
 * Screen Wake Lock API が使えない/効かない環境向けの代替手段。
 * 音声トラック付きの無音動画をインラインでループ再生し続けることで、iOS Safari の自動ロックを防ぐ
 * (NoSleep.js と同じ手法)。
 *
 * 制約:
 * - play() はユーザー操作(touchend / click)のハンドラ内から呼ばないと iOS では拒否される。
 * - 音声トラックがあるので、端末で再生中だった音楽は止まる。再生中はロック画面・コントロールセンターの
 *   メディア操作に出る。
 * - 一時停止しただけだとメディア操作に「一時停止中」として残り続ける。止める時は要素ごと破棄して
 *   (destroyVideoFallback)メディアセッションからも消す。次に始める時は要素を作り直す。
 * - タブを切り替えただけでは iOS は再生を止めない(音声付きなのでバックグラウンド再生扱い)ため、
 *   wakeLock.ts 側で visibilitychange / blur を見て破棄する。表に戻った後の次のタップで再開する。
 */

import { NOSLEEP_MP4, NOSLEEP_WEBM } from "./media";

let video: HTMLVideoElement | null = null;
let onPlayingChange: ((playing: boolean) => void) | null = null;

function createVideo(): HTMLVideoElement {
  const el = document.createElement("video");
  el.setAttribute("title", "画面ロック抑止");
  el.setAttribute("playsinline", "");
  el.setAttribute("webkit-playsinline", "");
  el.preload = "auto";
  // muted にすると iOS が「メディア再生中」とみなさずロックされるので、あえてミュートしない(動画自体が無音)
  el.muted = false;
  el.volume = 1;
  // 画面外に置く(display:none だと再生を止められることがある)
  Object.assign(el.style, {
    position: "fixed",
    left: "-10px",
    top: "-10px",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  for (const [type, src] of [
    ["video/webm", NOSLEEP_WEBM],
    ["video/mp4", NOSLEEP_MP4],
  ] as const) {
    const source = document.createElement("source");
    source.type = type;
    source.src = src;
    el.appendChild(source);
  }

  el.addEventListener("loadedmetadata", () => {
    if (el.duration <= 1) {
      // webm(短い): loop 属性で回す
      el.loop = true;
    } else {
      // mp4: 末尾まで行くと停止扱いになる環境があるので、途中で巻き戻し続ける
      el.addEventListener("timeupdate", () => {
        if (el.currentTime > 0.5) el.currentTime = Math.random() * 0.3;
      });
    }
  });

  el.addEventListener("playing", () => {
    if (video === el) onPlayingChange?.(true);
  });
  el.addEventListener("pause", () => {
    if (video === el) onPlayingChange?.(false);
  });

  document.body.appendChild(el);
  return el;
}

/** ロック画面・コントロールセンターのメディア操作から消す */
function clearMediaSession() {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.metadata = null;
  } catch {
    // 非対応・設定不可なら無視
  }
}

/**
 * ユーザー操作のハンドラ内から呼ぶこと。成功で true。
 * onChange は再生状態が変わるたび(OS に止められた時など)に呼ばれる。
 */
export async function startVideoFallback(onChange?: (playing: boolean) => void): Promise<boolean> {
  if (typeof document === "undefined") return false;
  if (onChange) onPlayingChange = onChange;
  const el = video ?? (video = createVideo());
  if (!el.paused && !el.ended) return true;
  try {
    await el.play();
    return video === el;
  } catch {
    return false;
  }
}

/**
 * 再生を止めて要素ごと破棄する。一時停止のままだとメディア操作に残るので、
 * ソースも外して load() し直し、DOM からも取り除く。
 */
export function destroyVideoFallback() {
  const el = video;
  video = null;
  if (!el) {
    clearMediaSession();
    return;
  }
  try {
    el.pause();
    while (el.firstChild) el.removeChild(el.firstChild);
    el.removeAttribute("src");
    el.load();
  } catch {
    // 破棄途中のエラーは無視
  }
  el.remove();
  clearMediaSession();
}

export function isVideoFallbackPlaying(): boolean {
  return !!video && !video.paused && !video.ended;
}
