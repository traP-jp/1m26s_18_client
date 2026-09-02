import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Player } from "textalive-app-api";

const TEXTALIVE_TOKEN = import.meta.env.VITE_TEXTALIVE_TOKEN as string | undefined;

export interface SongPlayerHandle {
  play: () => void;
  getPositionMs: () => number;
}

export interface SongPlayerProps {
  songUrl: string;
  onReady?: () => void;
  onLyricLineUpdate?: (line: string) => void;
  onBeat?: () => void;
}

// 音声再生専用
export const SongPlayer = forwardRef<SongPlayerHandle, SongPlayerProps>(function SongPlayer(
  { songUrl, onReady, onLyricLineUpdate, onBeat },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const onReadyRef = useRef(onReady);
  const onLyricLineUpdateRef = useRef(onLyricLineUpdate);
  const onBeatRef = useRef(onBeat);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);
  useEffect(() => {
    onLyricLineUpdateRef.current = onLyricLineUpdate;
  }, [onLyricLineUpdate]);
  useEffect(() => {
    onBeatRef.current = onBeat;
  }, [onBeat]);

  useImperativeHandle(ref, () => ({
    play: () => {
      try {
        playerRef.current?.requestPlay();
      } catch (err) {
        console.error("Failed to start song playback", err);
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
      playerRef.current = null;
    };
  }, [songUrl]);

  return <div ref={containerRef} className="viewer-song-player" aria-hidden="true" />;
});
