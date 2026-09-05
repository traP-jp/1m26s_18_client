import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ParticipantCounter, PenlightGrid, ReactionOverlay, colorIdToHex } from "ui";
import type { PenlightItem, PenlightWaveMode, ReactionItem } from "ui";
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
import { STAMPS, isBalloonStamp, stampById } from "stamps";
import type { Stamp } from "stamps";
import type { SongData } from "../api/songs";
import { useParticipantPenlights } from "../api/useParticipantPenlights";
import {
  mockSong,
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
  participantCount?: number;
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

/** Shake後にペンライトを発光させる時間 (ms)。単発フリック(0.28s)と合わせる */
const SHAKE_HIGHLIGHT_MS = 350;
/** 全体wave判定の集計窓 (ms) */
const WAVE_WINDOW_MS = 1000;
/** この窓内のShake数がこの値以上なら全体を fourFloor にする */
const WAVE_TRIGGER_COUNT = 3;

export function LiveScreen({
  onSongEnd,
  song,
  bpm,
  songUrl,
  connection,
  participantCount = 0,
}: LiveScreenProps) {
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
  // 曲の自然終了で「トップへ戻る」ボタンを表示する。
  const [songEnded, setSongEnded] = useState(false);
  const handleSongEnd = useCallback(() => setSongEnded(true), []);
  const handleReplay = useCallback(() => {
    setSongEnded(false);
    songPlayerRef.current?.play();
  }, []);
  const [lyricLine, setLyricLine] = useState(mockLyricLine);
  const handleLyricLineUpdate = useCallback((line: string) => setLyricLine(line), []);
  const [beatPulse, setBeatPulse] = useState(0);
  const handleBeat = useCallback(() => setBeatPulse((n) => n + 1), []);

  // 参加者ごとのペンライト状態 (色 + Shake時刻)。実参加者のみ描画する。
  const participantPenlights = useParticipantPenlights(connection);
  // Shakeハイライト失効用の時計。接続中のみ進める。
  const [nowMs, setNowMs] = useState(() => performance.now());
  useEffect(() => {
    if (!connection) return;
    const timer = window.setInterval(() => setNowMs(performance.now()), 120);
    return () => window.clearInterval(timer);
  }, [connection]);

  const participantLights = useMemo<PenlightItem[]>(
    () =>
      [...participantPenlights.values()]
        .sort((a, b) => (a.participantId < b.participantId ? -1 : 1))
        .map((p) => ({ id: p.participantId, color: colorIdToHex(p.colorId), intensity: 0.6, shakeSeq: p.shakeSeq })),
    [participantPenlights],
  );
  const shakingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of participantPenlights.values()) {
      if (p.lastShakeAtMs !== null && nowMs - p.lastShakeAtMs < SHAKE_HIGHLIGHT_MS) {
        ids.add(p.participantId);
      }
    }
    return ids;
  }, [participantPenlights, nowMs]);
  const recentShakeCount = useMemo(() => {
    let count = 0;
    for (const p of participantPenlights.values()) {
      if (p.lastShakeAtMs !== null && nowMs - p.lastShakeAtMs < WAVE_WINDOW_MS) {
        count += 1;
      }
    }
    return count;
  }, [participantPenlights, nowMs]);
  // 直近の盛り上がりに応じて会場全体をwaveさせる。部屋なしプレビュー時は mock 表示。
  const effectiveWaveMode: PenlightWaveMode =
    recentShakeCount >= WAVE_TRIGGER_COUNT ? "fourFloor" : waveMode;
  const lights = connection ? participantLights : mockPenlights;
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

  // 風船スタンプは浮遊、それ以外はポップのアニメーションで流す
  const pushReaction = useCallback((stamp: Stamp) => {
    const kind: ReactionItem["kind"] = isBalloonStamp(stamp) ? "balloon" : "stamp";
    reactionSeq += 1;
    setReactions((prev) => [
      ...prev,
      { id: `r${reactionSeq}`, kind, imageSrc: stamp.src, leftPct: 10 + Math.random() * 80 },
    ]);
  }, []);

  // 参加者が送ったスタンプ(サーバーが ParticipantStamp として中継)を流す。
  // stamp id はサーバーでは解釈されず、`stamps` パッケージの添字がそのまま id
  useEffect(() => {
    if (!connection) return;
    return connection.subscribeServerMessage((message) => {
      if (message.type !== "participantStamp") return;
      const stamp = stampById(message.stampId);
      if (!stamp) {
        console.warn("ignoring unknown stamp id", message.stampId);
        return;
      }
      pushReaction(stamp);
    });
  }, [connection, pushReaction]);

  // 部屋なしプレビュー時はランダムなリアクションを流して見た目を確認できるようにする
  useEffect(() => {
    if (connection || STAMPS.length === 0) return;
    const timer = window.setInterval(() => {
      pushReaction(STAMPS[Math.floor(Math.random() * STAMPS.length)]);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [connection, pushReaction]);

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
          onPlay={handleReplay}
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
            onSongEnd={handleSongEnd}
            songDurationMs={song?.durationMs ?? null}
            phrases={song?.type === "complete" ? song.phrases : undefined}
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
              {/* <ProgressBar segments={mockChorusSections} progressPct={mockPlaybackProgressPct} /> */}
              <ParticipantCounter count={participantCount} label="参加人数" />
            </div>
          </div>

          <div className="viewer-live__wave-demo" style={{ display: "none" }}>
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
          <PenlightGrid lights={lights} mode={effectiveWaveMode} shakingIds={shakingIds} />
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

        {songEnded && (
          <button type="button" className="viewer-live__end-button" onClick={onSongEnd}>
            トップへ戻る
          </button>
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
