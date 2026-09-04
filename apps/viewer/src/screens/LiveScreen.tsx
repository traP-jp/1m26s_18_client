import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ParticipantCounter, PenlightGrid, ProgressBar, ReactionOverlay } from "ui";
import type { PenlightWaveMode, ReactionItem } from "ui";
import { StagePlaceholder } from "../components/StagePlaceholder";
import { BackScreen } from "../components/BackScreen";
import { MikuModel3D } from "../components/MikuModel3D";
import { usePoseLandmarker } from "../pose/usePoseLandmarker";
import { VmdMotionRecorder } from "../pose/VmdMotionRecorder";
import type { PoseTrackerStatus } from "../pose/usePoseLandmarker";
import { useServerTime } from "protocol";
import type { RoomConnection } from "protocol";
import { SongPlayer } from "../components/SongPlayer";
import type { PlaybackAnchor, SongPlayerHandle } from "../components/SongPlayer";
import { stampImages } from "../stamps";
import type { SongData } from "../api/songs";
import {
  mockSong,
  mockChorusSections,
  mockPlaybackProgressPct,
  mockParticipantCount,
  mockPenlights,
  mockLyricLine,
} from "../mockData";

let reactionSeq = 0;

function vmdFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `motion_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.vmd`;
}

export interface LiveScreenProps {
  onSongEnd: () => void;
  song?: SongData | null;
  bpm?: number | null;
  songUrl?: string;
  /** ホストのWebTransport接続。nullのときはプレビュー動作(LiveStart不送信) */
  connection?: RoomConnection | null;
}

type LiveStartStatus = "idle" | "sending" | "sent" | "error";

const WAVE_MODE_LABELS: Record<PenlightWaveMode, string> = {
  idle: "静止",
  fourFloor: "四つ打ち",
  buildup: "溜め",
};

const POSE_STATUS_LABELS: Record<PoseTrackerStatus, string> = {
  idle: "",
  starting: "カメラ・モデル準備中…",
  running: "トラッキング中",
  error: "エラー",
};

export function LiveScreen({ song, bpm, songUrl, connection }: LiveScreenProps) {
  const [reactions, setReactions] = useState<ReactionItem[]>([]);
  const [waveMode, setWaveMode] = useState<PenlightWaveMode>("idle");
  const [songReady, setSongReady] = useState(!songUrl);
  const [poseEnabled, setPoseEnabled] = useState(false);
  const [poseMirror, setPoseMirror] = useState(true);
  const pose = usePoseLandmarker(poseEnabled);
  const vmdRecorderRef = useRef<VmdMotionRecorder | null>(null);
  vmdRecorderRef.current ??= new VmdMotionRecorder();
  const [vmdRecording, setVmdRecording] = useState(false);
  const songPlayerRef = useRef<SongPlayerHandle>(null);
  const handleSongReady = useCallback(() => setSongReady(true), []);
  const [lyricLine, setLyricLine] = useState(mockLyricLine);
  const handleLyricLineUpdate = useCallback((line: string) => setLyricLine(line), []);
  const [beatPulse, setBeatPulse] = useState(0);
  const handleBeat = useCallback(() => setBeatPulse((n) => n + 1), []);
  const serverTime = useServerTime();
  const [liveStartStatus, setLiveStartStatus] = useState<LiveStartStatus>("idle");
  const [liveStartError, setLiveStartError] = useState<string | null>(null);
  const [liveStartTimeUs, setLiveStartTimeUs] = useState<number | null>(null);
  const [anchorSpreadMs, setAnchorSpreadMs] = useState<number | null>(null);
  const title = song?.type === "complete" ? song.title : mockSong.title;
  const artist = song?.type === "complete" ? song.artist : mockSong.artist;
  const firstBeatMs = song?.beats[0]?.startsAtMs ?? 0;

  // ライブ画面に入った直後に時刻同期を freshen する。Providerは接続確立時に
  // 1回同期済みだが、ロビー滞在が長いとオフセットが古くなるため。
  const resync = serverTime.resync;
  useEffect(() => {
    if (connection) {
      resync();
    }
  }, [connection, resync]);

  /**
   * 再生原点が実測できたらLiveStartを送る。
   * TextAliveはrequestPlay時刻に再生開始を制御できないため、呼び出し時刻では
   * なく実測原点をサーバー時刻に換算して送る。コントローラー側は過去時刻を
   * 受けても経過換算で追いつく前提。
   */
  const handlePlaybackAnchored = useCallback(
    (anchor: PlaybackAnchor) => {
      setAnchorSpreadMs(anchor.spreadMs);
      if (!songUrl) return;
      if (!connection) {
        // 部屋なしプレビュー時
        if (import.meta.env.DEV) {
          console.debug("[LiveScreen] no connection; skipping liveStart");
        }
        return;
      }
      const startTimeUs = serverTime.toServerUs(anchor.localOriginMs);
      if (startTimeUs === null) {
        setLiveStartStatus("error");
        setLiveStartError("時刻同期が未完了のためLiveStartを送れませんでした");
        return;
      }
      const startTime = Math.round(startTimeUs);
      setLiveStartStatus("sending");
      setLiveStartError(null);
      void connection
        .request({ type: "liveStart", startTime })
        .then((response) => {
          if (response?.type === "error") {
            throw new Error(response.message);
          }
          // 応答なし(null)やliveStarted等は送信成功扱い。
          setLiveStartTimeUs(startTime);
          setLiveStartStatus("sent");
        })
        .catch((err: unknown) => {
          console.error("Failed to send liveStart", err);
          setLiveStartStatus("error");
          setLiveStartError(err instanceof Error ? err.message : "LiveStartの送信に失敗しました");
        });
    },
    [connection, serverTime, songUrl],
  );

  const handlePlaybackError = useCallback((message: string) => {
    setLiveStartStatus("error");
    setLiveStartError(message);
  }, []);

  const startVmdRecording = () => {
    vmdRecorderRef.current?.start();
    setVmdRecording(true);
  };

  /** 録画を止め、1フレーム以上あれば .vmd をダウンロードさせる */
  const stopVmdRecordingAndSave = () => {
    setVmdRecording(false);
    const recorder = vmdRecorderRef.current;
    if (!recorder) return;
    recorder.stop();
    if (recorder.frameCount === 0) return;
    const blob = new Blob([recorder.toVmd()], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = vmdFileName();
    anchor.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (stampImages.length === 0) return;
    const timer = window.setInterval(() => {
      const kind: ReactionItem["kind"] = Math.random() > 0.5 ? "stamp" : "balloon";
      reactionSeq += 1;
      setReactions((prev) => [
        ...prev,
        {
          id: `r${reactionSeq}`,
          kind,
          imageSrc: stampImages[Math.floor(Math.random() * stampImages.length)],
          leftPct: 10 + Math.random() * 80,
        },
      ]);
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);

  const removeReaction = (id: string) => {
    setReactions((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="viewer-live">
      <div className="viewer-live__stage-area">
        <StagePlaceholder />
        <BackScreen line={lyricLine} beatPulse={beatPulse} />
        <MikuModel3D
          poseFrameRef={pose.frameRef}
          poseImageFrameRef={pose.imageFrameRef}
          mirror={poseMirror}
          vmdRecorder={vmdRecorderRef.current}
          bpm={bpm}
          onPlay={() => songPlayerRef.current?.play()}
          onStop={() => songPlayerRef.current?.stop()}
          startAtMs={songUrl ? firstBeatMs : undefined}
          getPositionMs={songUrl ? () => songPlayerRef.current?.getPositionMs() ?? 0 : undefined}
          segments={songUrl ? song?.segments : undefined}
          readyToPlay={songReady}
        />
        {songUrl && (
          <SongPlayer
            ref={songPlayerRef}
            songUrl={songUrl}
            onReady={handleSongReady}
            onLyricLineUpdate={handleLyricLineUpdate}
            onBeat={handleBeat}
            onPlaybackAnchored={handlePlaybackAnchored}
            onPlaybackError={handlePlaybackError}
          />
        )}
        {songUrl && liveStartStatus === "error" && liveStartError && (
          <p className="viewer-hint" role="alert">
            LiveStart送信エラー: {liveStartError}
          </p>
        )}

        <header className="viewer-live__header">
          <div className="viewer-live__header-top">
            <div className="viewer-song-card viewer-song-card--compact">
              <div className="viewer-song-card__thumb" aria-hidden="true" />
              <div className="viewer-song-card__meta">
                <span className="viewer-song-card__title">{title}</span>
                <span className="viewer-song-card__artist">{artist}</span>
              </div>
            </div>

            <div className="viewer-live__header-stats">
              <ProgressBar segments={mockChorusSections} progressPct={mockPlaybackProgressPct} />
              <ParticipantCounter count={mockParticipantCount} label="参加人数" />
            </div>
          </div>

          <div className="viewer-live__wave-demo">
            {(Object.keys(WAVE_MODE_LABELS) as PenlightWaveMode[]).map((mode) => (
              <Button
                key={mode}
                variant={waveMode === mode ? "primary" : "ghost"}
                onClick={() => setWaveMode(mode)}
              >
                {WAVE_MODE_LABELS[mode]}
              </Button>
            ))}
            <Button
              variant={poseEnabled ? "primary" : "ghost"}
              onClick={() => {
                if (poseEnabled && vmdRecording) stopVmdRecordingAndSave();
                setPoseEnabled((v) => !v);
              }}
            >
              {poseEnabled ? "モーション ON" : "モーション OFF"}
            </Button>
            {poseEnabled && (
              <Button variant={poseMirror ? "primary" : "ghost"} onClick={() => setPoseMirror((v) => !v)}>
                鏡
              </Button>
            )}
            {poseEnabled && (
              <Button
                variant={vmdRecording ? "primary" : "ghost"}
                onClick={vmdRecording ? stopVmdRecordingAndSave : startVmdRecording}
              >
                {vmdRecording ? "■ VMD保存" : "● VMD録画"}
              </Button>
            )}
          </div>
        </header>

        <div className="viewer-live__audience">
          <PenlightGrid lights={mockPenlights} mode={waveMode} />
        </div>
        <ReactionOverlay items={reactions} onItemDone={removeReaction} />

        {poseEnabled && (
          <div className={`viewer-pose-preview${poseMirror ? " viewer-pose-preview--mirror" : ""}`}>
            <video ref={pose.videoRef} muted playsInline />
            <span className="viewer-pose-preview__status">
              {pose.status === "error" ? `エラー: ${pose.error ?? ""}` : POSE_STATUS_LABELS[pose.status]}
            </span>
          </div>
        )}
      </div>

      {/* <div className="viewer-live__hud">
        <div className="viewer-live__hud-item viewer-live__hud-item--grow">
          <Gauge valuePct={mockHeatLevel} label="シンクロ度" />
        </div>
        <Button variant="ghost" onClick={onSongEnd}>
          ライブ終了
        </Button>
      </div> */}
      {import.meta.env.DEV && songUrl && (
        <p className="viewer-hint">
          LiveStart: {liveStartStatus}
          {liveStartTimeUs !== null && ` / startTime=${liveStartTimeUs}`}
          {anchorSpreadMs !== null && ` / anchor spread=${anchorSpreadMs.toFixed(1)}ms`}
          {serverTime.offsetUs !== null && ` / offset=${(serverTime.offsetUs / 1000).toFixed(1)}ms`}
          {serverTime.rttMs !== null && ` / RTT=${serverTime.rttMs.toFixed(1)}ms`}
        </p>
      )}
    </div>
  );
}
