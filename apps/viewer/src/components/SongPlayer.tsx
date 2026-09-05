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
  /**
   * 楽曲が最後まで再生されたときに呼ばれる。ポーリングはせず、
   * TextAliveのイベントハンドラ(`onStop`/`onPause`)のみで検知する。
   *
   * 注意: 自然終了のイベントはバックエンドで異なる。`mediaFinish`由来の
   * `onStop`になる場合と、末尾到達で`onPause`(位置は0に巻き戻る)に
   * なる場合がある。後者と手動停止・途中の一時停止を区別するため、
   * `onPause`時は`onTimeUpdate`で記録した最終位置が末尾付近のときだけ
   * 終了とみなす。長さは`player.video.duration`を優先し、なければ
   * `songDurationMs`を使う。`stop()`経由の手動停止は内部フラグで抑制する。
   */
  onSongEnd?: () => void;
  /** 曲長[ms]のフォールバック(`player.video.duration`が取れない場合用) */
  songDurationMs?: number | null;
}

// 原点確定に使う先頭サンプル数。onTimeUpdateは毎フレーム来る想定で、
// 5サンプルあればtimer位置の量子化・コールバック遅延を中央値で平滑化できる。
const ANCHOR_SAMPLE_COUNT = 5;
// requestPlay後にこの時間待ってもサンプルが集まらなければ諦める。
const ANCHOR_TIMEOUT_MS = 3000;
// この再生位置を超えたサンプルは原点計算に使わない。開始直後のみ対象。
const ANCHOR_MAX_POSITION_MS = 10000;
// `onPause`を曲終了とみなす末尾マージン[ms]。onTimeUpdateの最終通知と
// 実際の末尾には多少の乖離があるため余裕を持つ。
const SONG_END_MARGIN_MS = 2000;

// 音声再生専用
export const SongPlayer = forwardRef<SongPlayerHandle, SongPlayerProps>(function SongPlayer(
  {
    songUrl,
    onReady,
    onLyricLineUpdate,
    onBeat,
    onPlaybackAnchored,
    onPlaybackError,
    onSongEnd,
    songDurationMs,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const onReadyRef = useRef(onReady);
  const onLyricLineUpdateRef = useRef(onLyricLineUpdate);
  const onBeatRef = useRef(onBeat);
  const onPlaybackAnchoredRef = useRef(onPlaybackAnchored);
  const onPlaybackErrorRef = useRef(onPlaybackError);
  const onSongEndRef = useRef(onSongEnd);
  const songDurationMsRef = useRef(songDurationMs);
  // `stop()`経由の手動停止による`onStop`/`onPause`を無視するためのフラグ。
  // 手動停止では両イベントが対で来ることがあるため、`onPause`では消費せず
  // 覗くだけにし、`onStop`で消費する。
  const manualStopRef = useRef(false);
  // `onTimeUpdate`で見た最新の再生位置。自然終了時の`onPause`は位置が
  // 0に巻き戻った後で届くため、終了付近まで進んでいたかの判定に使う。
  const lastPositionMsRef = useRef(-1);
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
  useEffect(() => {
    onSongEndRef.current = onSongEnd;
  }, [onSongEnd]);
  useEffect(() => {
    songDurationMsRef.current = songDurationMs;
  }, [songDurationMs]);

  /**
   * 終了イベント(`onStop`/`onPause`)を曲終了として通知すべきか判定する。
   * 手動停止由来なら`onStop`到達時にフラグを消費して捨てる。
   * `viaStop`がfalse(`onPause`)の場合はフラグを消費しない。
   */
  const maybeNotifySongEnd = (viaStop: boolean) => {
    if (manualStopRef.current) {
      if (viaStop) manualStopRef.current = false;
      return;
    }
    let durationMs: number | null = null;
    try {
      const videoDuration = playerRef.current?.video?.duration;
      if (typeof videoDuration === "number" && videoDuration > 0) {
        durationMs = videoDuration;
      }
    } catch {
      // video情報の取得に失敗したらフォールバックに任せる
    }
    if (durationMs === null) {
      const fallback = songDurationMsRef.current;
      if (typeof fallback === "number" && fallback > 0) durationMs = fallback;
    }
    if (viaStop && durationMs === null) {
      // 長さ不明でも、手動でない`onStop`は自然終了とみなす。
      onSongEndRef.current?.();
      return;
    }
    if (durationMs !== null && lastPositionMsRef.current >= durationMs - SONG_END_MARGIN_MS) {
      onSongEndRef.current?.();
    }
  };
  // refのみを触るため、毎レンダーの新しい実体を使い回してよい。
  // player生成effectからは最新の実体を参照できるようref経由で呼ぶ。
  const maybeNotifySongEndRef = useRef(maybeNotifySongEnd);
  maybeNotifySongEndRef.current = maybeNotifySongEnd;

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
        // 次の再生では自然終了を検知できるよう、手動停止フラグと最終位置をクリアする。
        manualStopRef.current = false;
        lastPositionMsRef.current = -1;
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
      // 手動停止による`onStop`は曲終了として扱わない。
      manualStopRef.current = true;
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
      onStop: () => {
        maybeNotifySongEndRef.current(true);
      },
      onPause: () => {
        // 末尾到達で`onPause`になるバックエンドがあるため、終了付近の
        // 一時停止は曲終了とみなす(手動停止由来はフラグで除外)。
        maybeNotifySongEndRef.current(false);
      },
      onTimeUpdate: (position: number) => {
        if (position >= 0) lastPositionMsRef.current = position;
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
      manualStopRef.current = false;
      lastPositionMsRef.current = -1;
      playerRef.current = null;
    };
  }, [songUrl]);

  return <div ref={containerRef} className="viewer-song-player" aria-hidden="true" />;
});
