import { useEffect, useState } from "react";
import { Button, ParticipantCounter, RoomJoinCard } from "ui";
import { useServerTime } from "protocol";
import type { SongData } from "../api/songs";
import type { RoomInfo } from "../api/rooms";
import type { HostRoomState } from "../api/useHostRoom";
import { mockSong, mockRoomCode } from "../mockData";
import { buildControllerJoinUrl } from "../api/config";

export interface LobbyScreenProps {
  onNext: () => void;
  song?: SongData | null;
  room?: RoomInfo | null;
  hostRoom?: HostRoomState;
}

/** unix µs を「日時.ミリ秒」表示にする(デバッグ用) */
function formatServerTimeUs(serverTimeUs: number): string {
  const ms = Math.floor(serverTimeUs / 1000);
  return `${new Date(ms).toLocaleString("ja-JP", { hour12: false })}.${String(ms % 1000).padStart(3, "0")}`;
}

export function LobbyScreen({ onNext, song, room, hostRoom }: LobbyScreenProps) {
  const status = hostRoom?.status ?? "idle";
  const roomCode = room?.roomId ?? mockRoomCode;
  const joinUrl = buildControllerJoinUrl(roomCode);
  const serverTime = useServerTime();
  const serverNowUs = serverTime.nowUs();
  // デバッグ表示用: 補正後の時刻が進んでいることを確認できるよう、開発時のみ定期的に再レンダーする
  const [, setDebugTick] = useState(0);
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    const timer = window.setInterval(() => setDebugTick((tick) => tick + 1), 50);
    return () => window.clearInterval(timer);
  }, []);
  const title = song?.type === "complete" ? song.title : mockSong.title;
  const artist = song?.type === "complete" ? song.artist : mockSong.artist;

  const isConnecting = room != null && status !== "connected";

  return (
    <div className="viewer-lobby">
      <div className="stage-ambience" aria-hidden="true">
        <div className="stage-ambience__glow stage-ambience__glow--warm" />
        <div className="stage-ambience__glow stage-ambience__glow--cool" />
        <div className="stage-ambience__beams" />
      </div>

      <div className="viewer-lobby__content">
        <header className="viewer-lobby__header">
          <p className="stage-eyebrow">ようこそ、今日は来てくれてありがとう。最後までみんなで楽しもう！</p>
          <h1 className="stage-title">BACKSTAGE</h1>
          <div className="viewer-lobby__header-row">
            <div className="viewer-song-card">
              <div className="viewer-song-card__thumb" aria-hidden="true" />
              <div className="viewer-song-card__meta">
                <span className="viewer-song-card__title">{title}</span>
                <span className="viewer-song-card__artist">{artist}</span>
              </div>
            </div>
            <ParticipantCounter count={hostRoom?.participantCount ?? 0} label="参加人数" />
          </div>
        </header>

        <div className="viewer-lobby__body">
          <div className="viewer-lobby__pass">
            <span className="viewer-lobby__pass-label">BACKSTAGE PASS</span>
            <RoomJoinCard roomCode={roomCode} joinUrl={joinUrl} />
            <span className="viewer-lobby__pass-hint">
              このコードをコントローラー端末に入力して参加
            </span>
          </div>
        </div>

        {import.meta.env.DEV && (
          <div className="viewer-lobby__debug">
            <span className="viewer-lobby__debug-tag">DEV</span>
            <p className="viewer-hint">
              時刻同期: {serverTime.synced ? "同期済み" : "同期中…"}
              {serverTime.offsetUs !== null && ` / オフセット: ${(serverTime.offsetUs / 1000).toFixed(1)}ms`}
              {serverTime.rttMs !== null && ` / RTT: ${serverTime.rttMs.toFixed(1)}ms`}
              {" / "}
              サーバー時刻: {serverNowUs === null ? "—" : formatServerTimeUs(serverNowUs)}
            </p>
            <Button variant="ghost" onClick={() => serverTime.resync()}>
              再同期
            </Button>
          </div>
        )}

        <div className="stage-footer-spacer" aria-hidden="true" />
      </div>

      <div className="stage-ticket">
        <div className="stage-ticket__info">
          <span className={`stage-ticket__status${isConnecting ? " stage-ticket__status--muted" : ""}`}>
            {isConnecting ? "コントローラーの接続待ち…" : "準備完了"}
          </span>
        </div>
        <Button onClick={onNext} disabled={isConnecting}>
          ライブ開始
        </Button>
      </div>
    </div>
  );
}
