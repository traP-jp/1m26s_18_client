import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Player } from "textalive-app-api";

const TEXTALIVE_TOKEN = import.meta.env.VITE_TEXTALIVE_TOKEN as string | undefined;

export interface SongPlayerHandle {
  play: () => void;
  getPositionMs: () => number;
}

export interface SongPlayerProps {
  songUrl: string;
}

// 音声再生専用
export const SongPlayer = forwardRef<SongPlayerHandle, SongPlayerProps>(function SongPlayer(
  { songUrl },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);

  useImperativeHandle(ref, () => ({
    play: () => {
      playerRef.current?.requestPlay();
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

    player.createFromSongUrl(songUrl).catch((err: unknown) => {
      console.error("Failed to load song for playback", err);
    });

    return () => {
      playerRef.current = null;
    };
  }, [songUrl]);

  return <div ref={containerRef} className="viewer-song-player" aria-hidden="true" />;
});
