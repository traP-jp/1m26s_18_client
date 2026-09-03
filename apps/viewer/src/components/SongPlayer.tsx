import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Player } from "textalive-app-api";

const TEXTALIVE_TOKEN = import.meta.env.VITE_TEXTALIVE_TOKEN as string | undefined;

export interface SongPlayerHandle {
  /**
   * 再生を開始する(TextAlive APIのrequestPlay相当)。
   * Autoplayポリシーのため、ユーザージェスチャーのコールスタック内で
   * 同期的にrequestPlay()を呼ぶ。戻り値はリクエスト受理可否。
   * 実際の再生開始時刻は非同期に確定し、`onPlaybackAnchored` で通知される。
   */
  play: () => boolean;
  // 一時停止した上で先頭に巻き戻す(TextAlive APIのrequestStop相当)。
  stop: () => void;
  getPositionMs: () => number;
}

/**
 * 再生開始原点の実測結果。`position == 0` の瞬間をローカル時計で表す。
 *
 * TextAliveの`requestPlay()`は開始時刻を指定できず、実際の音出しは
 * 非同期に遅延する。そのため呼び出し時刻ではなく、再生開始後の
 * `(受信時刻 t, 再生位置 pos)` から `origin = t - pos` を逆算する。
 */
export interface PlaybackAnchor {
  /** `position == 0` の瞬間のローカル時刻 (`performance.now()` 基準, ms) */
  localOriginMs: number;
  /** `requestPlay()` を呼んだローカル時刻 (`performance.now()` 基準, ms) */
  requestedAtMs: number;
  /** 原点が確定したローカル時刻 (`performance.now()` 基準, ms) */
  anchoredAtMs: number;
  /** 原点計算に使ったサンプル数 */
  sampleCount: number;
  /** `origin` 推定値のばらつき (max - min, ms)。大きいほど不確か */
  spreadMs: number;
  /** 最初のサンプルの再生位置 (ms) */
  firstPositionMs: number;
}

export interface SongPlayerProps {
  songUrl: string;
  onReady?: () => void;
  onLyricLineUpdate?: (line: string) => void;
  onBeat?: () => void;
  /** 再生原点が実測できたときに呼ばれる。LiveStart送信用 */
  onPlaybackAnchored?: (anchor: PlaybackAnchor) => void;
  /** 再生開始・原点確定に失敗したときに呼ばれる */
  onPlaybackError?: (message: string) => void;
}

// 原点確定に使う先頭サンプル数。onTimeUpdateは毎フレーム来る想定で、
// 5サンプルあればtimer位置の量子化・コールバック遅延を中央値で平滑化できる。
const ANCHOR_SAMPLE_COUNT = 5;
// requestPlay後にこの時間待ってもサンプルが集まらなければ諦める。
const ANCHOR_TIMEOUT_MS = 3000;
// この再生位置を超えたサンプルは原点計算に使わない。開始直後のみ対象。
const ANCHOR_MAX_POSITION_MS = 10000;

// 音声再生専用
export const SongPlayer = forwardRef<SongPlayerHandle, SongPlayerProps>(function SongPlayer(
  { songUrl, onReady, onLyricLineUpdate, onBeat, onPlaybackAnchored, onPlaybackError },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const onReadyRef = useRef(onReady);
  const onLyricLineUpdateRef = useRef(onLyricLineUpdate);
  const onBeatRef = useRef(onBeat);
  const onPlaybackAnchoredRef = useRef(onPlaybackAnchored);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    onLyricLineUpdateRef.current = onLyricLineUpdate;
  }, [onLyricLineUpdate]);
  useEffect(() => {
    onBeatRef.current = onBeat;
  }, [onBeat]);
  useEffect(() => {
    onPlaybackAnchoredRef.current = onPlaybackAnchored;
  }, [onPlaybackAnchored]);
  useEffect(() => {
    onPlaybackErrorRef.current = onPlaybackError;
  }, [onPlaybackError]);

  // 再生原点の計測状態。play()での同期開始とonTimeUpdateでの非同期収集、
  // タイムアウト処理の3箇所から触るためrefで共有する。
  const anchorRef = useRef<{
    collecting: boolean;
    requestedAtMs: number;
    samples: { t: number; pos: number }[];
    timeoutId: number | null;
  }>({ collecting: false, requestedAtMs: 0, samples: [], timeoutId: null });

  const cancelAnchorLocked = () => {
    const state = anchorRef.current;
    state.collecting = false;
    state.samples = [];
    if (state.timeoutId !== null) {
      window.clearTimeout(state.timeoutId);
      state.timeoutId = null;
    }
  };

  const finalizeAnchor = () => {
    const state = anchorRef.current;
    if (!state.collecting) return;
    state.collecting = false;
    if (state.timeoutId !== null) {
      window.clearTimeout(state.timeoutId);
      state.timeoutId = null;
    }
    if (state.samples.length === 0) {
      onPlaybackErrorRef.current?.(
        "再生位置が取得できませんでした(ネットワークや自動再生制限を確認してください)",
      );
      state.samples = [];
      return;
    }
    const origins = state.samples.map((s) => s.t - s.pos).sort((a, b) => a - b);
    const median = origins[Math.floor(origins.length / 2)];
    const spread = origins[origins.length - 1] - origins[0];
    const anchor: PlaybackAnchor = {
      localOriginMs: median,
      requestedAtMs: state.requestedAtMs,
      anchoredAtMs: performance.now(),
      sampleCount: state.samples.length,
      spreadMs: spread,
      firstPositionMs: state.samples[0].pos,
    };
    state.samples = [];
    if (import.meta.env.DEV) {
      console.debug(
        `[SongPlayer] playback anchored: origin=${median.toFixed(1)} ` +
          `requestedAt=${anchor.requestedAtMs.toFixed(1)} ` +
          `delay=${(median - anchor.requestedAtMs).toFixed(1)}ms ` +
          `samples=${anchor.sampleCount} spread=${spread.toFixed(1)}ms`,
      );
    }
    onPlaybackAnchoredRef.current?.(anchor);
  };
  // finalizeAnchorはrefのみを触るため、毎レンダーの新しい実体を使い回してよい。
  // player生成effectからは最新の実体を参照できるようref経由で呼ぶ。
  const finalizeAnchorRef = useRef(finalizeAnchor);
  finalizeAnchorRef.current = finalizeAnchor;

  useImperativeHandle(ref, () => ({
    play: () => {
      const player = playerRef.current;
      if (!player) {
        onPlaybackErrorRef.current?.("プレイヤーの準備ができていません");
        return false;
      }
      try {
        // 前回の計測残渣を捨て、requestPlay()と同刻に計測開始する。
        // awaitを挟まず同期的に呼ぶこと(iOS Safariのジェスチャー判定のため)。
        cancelAnchorLocked();
        const accepted = player.requestPlay();
        if (!accepted) {
          onPlaybackErrorRef.current?.("再生リクエストが受理されませんでした");
          return false;
        }
        const requestedAtMs = performance.now();
        anchorRef.current.collecting = true;
        anchorRef.current.requestedAtMs = requestedAtMs;
        anchorRef.current.samples = [];
        anchorRef.current.timeoutId = window.setTimeout(() => {
          // タイムアウト時点で1サンプルでもあれば確定させ、
          // なければエラーにする。
          if (anchorRef.current.samples.length > 0) {
            finalizeAnchorRef.current();
          } else {
            anchorRef.current.collecting = false;
            anchorRef.current.timeoutId = null;
            onPlaybackErrorRef.current?.("再生開始を確認できませんでした(タイムアウト)");
          }
        }, ANCHOR_TIMEOUT_MS);
        return true;
      } catch (err) {
        console.error("Failed to start song playback", err);
        onPlaybackErrorRef.current?.("再生開始に失敗しました");
        return false;
      }
    },
    stop: () => {
      cancelAnchorLocked();
      try {
        playerRef.current?.requestStop();
      } catch (err) {
        console.error("Failed to stop song playback", err);
      }
    },
    getPositionMs: () => {
      try {
        return playerRef.current?.timer.position ?? 0;
      } catch {
        return 0;
      }
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // クリーンアップ時にはrefの値が変わっている可能性があるため、
    // effect内でコピーしたものを使う(anchorRef自体は付け替えず中身だけ変える)。
    const anchorStateAtMount = anchorRef.current;
    if (!TEXTALIVE_TOKEN) {
      console.error("VITE_TEXTALIVE_TOKEN is not set; song playback is disabled");
      return;
    }

    const player = new Player({
      app: { token: TEXTALIVE_TOKEN },
      mediaElement: container,
      mediaBannerPosition: null,
    });
    playerRef.current = player;

    // フレーズが新しく発声され始めたらそのフレーズ全文
    // ビートが1つ進んだらonBeat
    let lastPhraseTime = -1;
    let lastBeatTime = -1;
    player.addListener({
      onTimerReady: () => onReadyRef.current?.(),
      onTimeUpdate: (position: number) => {
        // 再生原点の実測: 先頭サンプルから origin = t - pos を集める。
        // requestPlay()呼び出し時刻は使わない(非同期遅延を含むため)。
        const anchorState = anchorRef.current;
        if (anchorState.collecting) {
          if (position >= 0 && position <= ANCHOR_MAX_POSITION_MS) {
            anchorState.samples.push({ t: performance.now(), pos: position });
            if (anchorState.samples.length >= ANCHOR_SAMPLE_COUNT) {
              finalizeAnchorRef.current();
            }
          }
        }

        if (lastBeatTime > position + 1000) lastBeatTime = -1;
        const beats = player.findBeatChange(lastBeatTime, position);
        if (beats.entered.length > 0) onBeatRef.current?.();
        lastBeatTime = position;

        if (!player.video?.firstPhrase) return;
        if (lastPhraseTime > position + 1000) lastPhraseTime = -1;
        const phrases = player.video.findPhraseChange(lastPhraseTime, position);
        const entered = phrases.entered.at(-1);
        if (entered) onLyricLineUpdateRef.current?.(entered.text);
        lastPhraseTime = position;
      },
    });

    player.createFromSongUrl(songUrl).catch((err: unknown) => {
      console.error("Failed to load song for playback", err);
    });

    return () => {
      anchorStateAtMount.collecting = false;
      anchorStateAtMount.samples = [];
      if (anchorStateAtMount.timeoutId !== null) {
        window.clearTimeout(anchorStateAtMount.timeoutId);
        anchorStateAtMount.timeoutId = null;
      }
      playerRef.current = null;
    };
  }, [songUrl]);

  return <div ref={containerRef} className="viewer-song-player" aria-hidden="true" />;
});
