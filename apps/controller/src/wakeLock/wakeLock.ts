/**
 * 画面の自動ロック(スリープ)を抑止する。
 * コントローラーは振っている間ずっと画面を触らないので、放置扱いで画面が消えないようにする。
 *
 * 利用者がキャリブレーション画面で「許可する」をタップするまでは何もしない(マイク・センサーと同じ扱い)。
 * ブラウザ側の許可ダイアログは存在しないので、これはアプリ内の同意にすぎないが、
 * iOS の動画再生はタップの中でしか始められないため、このタップが実質的な開始トリガーにもなる。
 *
 * 許可後は 2 段構えで動く:
 * 1. Screen Wake Lock API(navigator.wakeLock)
 *    - Android Chrome: 対応。HTTPS(または localhost)が必要。
 *    - iOS Safari 16.4+: 対応だが、ホーム画面に追加した Web アプリでは iOS 18.4 まで効かない、
 *      LINE 等のアプリ内ブラウザでは API 自体が無い、低電力モードだと拒否される、など穴が多い。
 * 2. 無音動画のインライン再生(NoSleep.js 方式、videoFallback.ts)
 *    - iOS(iPhone/iPad)では 1 の結果に関わらず常に併用する。他の環境では 1 が使えない時だけ使う。
 *    - play() はユーザー操作(touchend / click)の中でしか成功しないので、次のタップまで "pending" になる。
 *
 * 共通の制約:
 * - タブが裏に回る・フォーカスが外れる・画面が消える と Wake Lock API は OS が解放する。
 *   動画は裏でも鳴り続け、止めただけでもメディア操作に残るので、こちらで要素ごと破棄する。
 *   表に戻った時と次のタップで自動的に取り直す。
 */

import { destroyVideoFallback, isVideoFallbackPlaying, startVideoFallback } from "./videoFallback";

export type WakeLockStatus = "unsupported" | "insecure" | "inactive" | "active" | "denied";
/** 動画による代替手段の状態。none = 使わない, pending = 次のタップで開始, active = 再生中 */
export type WakeLockFallback = "none" | "pending" | "active";
/** アプリ内の同意状態。prompt = まだ「許可する」を押していない */
export type WakeLockPermission = "prompt" | "granted";

export interface WakeLockSnapshot {
  permission: WakeLockPermission;
  status: WakeLockStatus;
  fallback: WakeLockFallback;
  error?: string;
}

type Listener = () => void;

let sentinel: WakeLockSentinel | null = null;
let wanted = 0; // 「維持したい」と宣言しているフックの数。0 になったら解放する
let snapshot: WakeLockSnapshot = { permission: "prompt", status: initialStatus(), fallback: "none" };
const listeners = new Set<Listener>();
let listenersArmed = false;
let requesting: Promise<void> | null = null;

function initialStatus(): WakeLockStatus {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return "unsupported";
  if (typeof window !== "undefined" && !window.isSecureContext) return "insecure";
  return "inactive";
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ は Macintosh を名乗るのでタッチ点数で判別する
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function setSnapshot(patch: Partial<WakeLockSnapshot>) {
  const next = { ...snapshot, ...patch };
  if ("error" in patch && patch.error === undefined) delete next.error;
  if (
    next.permission === snapshot.permission &&
    next.status === snapshot.status &&
    next.fallback === snapshot.fallback &&
    next.error === snapshot.error
  ) {
    return;
  }
  snapshot = next;
  for (const l of listeners) l();
}

export function isWakeLockSupported(): boolean {
  return initialStatus() !== "unsupported";
}

/** 利用者が許可済みで、かつ維持したい画面がマウントされているか */
function isActiveWanted(): boolean {
  return wanted > 0 && snapshot.permission === "granted";
}

/** 動画による代替を使うべきか。iOS は Wake Lock API が当てにならないので常に併用する */
function shouldUseVideo(): boolean {
  if (!isActiveWanted()) return false;
  if (isIOS()) return true;
  return snapshot.status === "unsupported" || snapshot.status === "insecure" || snapshot.status === "denied";
}

function isForeground(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible";
}

// ---- Wake Lock API ----

async function acquireNative() {
  if (snapshot.status === "unsupported" || snapshot.status === "insecure") return;
  if (!isActiveWanted() || sentinel) return;
  if (!isForeground()) return;
  if (requesting) return requesting;

  requesting = (async () => {
    try {
      const lock = await navigator.wakeLock.request("screen");
      // 待っている間に不要になった場合はすぐ手放す
      if (!isActiveWanted()) {
        await lock.release();
        return;
      }
      sentinel = lock;
      lock.addEventListener("release", () => {
        if (sentinel === lock) sentinel = null;
        // 自分で release() した場合は inactive のまま。
        // OS 側で解放された場合(バックグラウンド等)は visibilitychange で取り直す。
        setSnapshot({ status: "inactive" });
      });
      setSnapshot({ status: "active", error: undefined });
    } catch (e) {
      // NotAllowedError: 低電力モード / 権限ポリシーで拒否 など
      const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      setSnapshot({ status: "denied", error: message });
    } finally {
      requesting = null;
    }
  })();
  return requesting;
}

async function releaseNative() {
  const lock = sentinel;
  sentinel = null;
  if (!lock) return;
  try {
    await lock.release();
  } catch {
    // 既に解放済みなど。無視してよい
  }
  setSnapshot({ status: "inactive" });
}

// ---- 動画による代替 ----

/** ユーザー操作の中から呼ぶと成功しやすい。操作外から呼んだ場合は失敗しても pending のまま次のタップを待つ */
async function acquireVideo() {
  if (!shouldUseVideo()) return;
  if (!isForeground()) return;
  if (isVideoFallbackPlaying()) {
    setSnapshot({ fallback: "active" });
    return;
  }
  setSnapshot({ fallback: "pending" });
  const ok = await startVideoFallback((playing) => {
    // OS に止められた(バックグラウンド等)→ 次のタップで再開
    if (isActiveWanted()) setSnapshot({ fallback: playing ? "active" : "pending" });
  });
  if (!isActiveWanted()) {
    destroyVideoFallback();
    return;
  }
  setSnapshot({ fallback: ok ? "active" : "pending" });
}

/** 動画を要素ごと破棄する。keepPending なら次のタップで再開する状態にしておく */
function releaseVideo(keepPending: boolean) {
  destroyVideoFallback();
  setSnapshot({ fallback: keepPending && shouldUseVideo() ? "pending" : "none" });
}

// ---- 共通 ----

function acquire(): Promise<void> {
  return Promise.all([acquireNative(), acquireVideo()]).then(() => undefined);
}

/** 裏に回った/フォーカスが外れた: 動画は鳴り続け、止めてもメディア操作に残るので要素ごと消す */
function onBackground() {
  releaseVideo(true);
}

function onVisibilityChange() {
  if (isForeground()) {
    void acquire();
  } else {
    onBackground();
  }
}

function onWindowFocus() {
  void acquire();
}

function armGlobalListeners() {
  if (listenersArmed || typeof document === "undefined") return;
  listenersArmed = true;
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("blur", onBackground);
  window.addEventListener("focus", onWindowFocus);
  window.addEventListener("pagehide", onBackground);
  // 拒否された/止められた場合の再試行。タップの中なので動画の play() も通る。
  // iOS で「ユーザー操作」として扱われるのは touchend / click(touchstart や pointerdown では不可)
  window.addEventListener("touchend", onUserGesture, { passive: true });
  window.addEventListener("click", onUserGesture, { passive: true });
}

function onUserGesture() {
  if (!isActiveWanted()) return;
  const needNative = !sentinel;
  const needVideo = shouldUseVideo() && !isVideoFallbackPlaying();
  if (needNative || needVideo) void acquire();
}

export const wakeLock = {
  /**
   * 「画面を維持したい」と宣言する。戻り値の関数で宣言を取り下げる。
   * 利用者が requestPermission() で許可するまでは実際には何も取得しない。
   */
  retain(): () => void {
    wanted += 1;
    armGlobalListeners();
    void acquire();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      wanted -= 1;
      if (wanted === 0) {
        void releaseNative();
        releaseVideo(false);
      }
    };
  },
  /**
   * 利用者の「許可する」タップで呼ぶ。以降、retain() 中の画面で画面ロック抑止を実際に動かす。
   * タップハンドラから直接呼ぶこと(動画の再生開始に必要)。
   */
  requestPermission(): Promise<void> {
    setSnapshot({ permission: "granted" });
    return acquire();
  },
  /** 明示的に今すぐ取り直す。タップハンドラから呼ぶと動画の再生も確実に始まる */
  refresh(): Promise<void> {
    return acquire();
  },
  getSnapshot(): WakeLockSnapshot {
    return snapshot;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
