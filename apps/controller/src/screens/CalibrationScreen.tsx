import { useEffect, useState } from "react";
import { Button, ColorPicker, IconToggleButton, Panel, PENLIGHT_PALETTE } from "ui";
import { useServerTime } from "protocol";
import { ShakeTestArea } from "../components/ShakeTestArea";
import { armAudioUnlock, requestMotionPermission, useMotionStatus, type MotionStatus } from "../motion/useMotion";
import { refreshWakeLock, requestWakeLockPermission, useWakeLock, type WakeLockSnapshot } from "../wakeLock/useWakeLock";
import { mockInitialPermissions, type PermissionStatus } from "../mockData";
export interface CalibrationScreenProps {
  color: string;
  onColorChange: (color: string) => void;
  onReady: () => void;
  /** 楽曲のビート列を取得済みか。未取得の間は「ライブへ進む」を押せない */
  canProceed: boolean;
}

/** unix µs を「日時.ミリ秒」表示にする(デバッグ用) */
function formatServerTimeUs(serverTimeUs: number): string {
  const ms = Math.floor(serverTimeUs / 1000);
  return `${new Date(ms).toLocaleString("ja-JP", { hour12: false })}.${String(ms % 1000).padStart(3, "0")}`;
}

const STATUS_LABEL: Record<PermissionStatus, string> = {
  granted: "許可済み",
  prompt: "未許可",
  denied: "拒否",
};

const MOTION_STATUS_LABEL: Record<MotionStatus, string> = {
  unsupported: "非対応",
  insecure: "HTTPS が必要",
  prompt: "未許可",
  requesting: "確認中…",
  granted: "許可済み",
  denied: "拒否",
  unavailable: "検出できません",
};

const MOTION_HINT: Partial<Record<MotionStatus, string>> = {
  unsupported: "このブラウザはモーションセンサーに対応していません。試し振りはタップで代替できます。",
  insecure:
    "http 接続のためセンサーを利用できません。https:// で開き直してください(iOS では必須です)。",
  denied:
    "センサーの利用が拒否されました。iOS の場合は Safari を一度終了して開き直す、または 設定 > Safari > 「モーションと画面の向きのアクセス」をオンにしてから再読み込みしてください。",
  unavailable:
    "モーションセンサーを検出できませんでした(PC ブラウザなど)。試し振りはタップで代替できます。",
};

interface WakeLockView {
  label: string;
  ok: boolean;
  error: boolean;
  /** ボタンの文言。undefined なら無効化 */
  action?: string;
  hint?: string;
}

/** 画面ロック抑止の状態を 1 行にまとめる。動画による代替が動いていればそちらを優先して表示 */
function describeWakeLock(w: WakeLockSnapshot): WakeLockView {
  // 許可前は対応状況に関わらず「未許可」。API が無くても動画で代替できるので、まず許可してもらう
  if (w.permission === "prompt") return { label: "未許可", ok: false, error: false, action: "許可する" };
  if (w.fallback === "active") return { label: "許可済み(動画)", ok: true, error: false };
  if (w.status === "active") return { label: "許可済み", ok: true, error: false };
  if (w.fallback === "pending") {
    return {
      label: "タップで再開",
      ok: false,
      error: false,
      action: "再開",
      hint: "画面のどこかを一度タップすると画面ロック抑止が再開します。",
    };
  }
  switch (w.status) {
    case "unsupported":
      return {
        label: "非対応",
        ok: false,
        error: true,
        hint: "このブラウザは画面ロック抑止に対応していません。端末の自動ロックを長めに設定してください。",
      };
    case "insecure":
      return {
        label: "HTTPS が必要",
        ok: false,
        error: true,
        hint: "http 接続のため画面ロック抑止を利用できません。https:// で開き直してください。",
      };
    case "denied":
      return {
        label: "拒否",
        ok: false,
        error: true,
        action: "再試行",
        hint: `画面ロック抑止が拒否されました(${w.error ?? "原因不明"})。低電力モードをオフにして再試行してください。`,
      };
    default:
      return { label: "確認中…", ok: false, error: false, action: "再試行" };
  }
}

export function CalibrationScreen({ color, onColorChange, onReady, canProceed }: CalibrationScreenProps) {
  const [permissions, setPermissions] = useState(mockInitialPermissions);
  const [ready, setReady] = useState(false);
  const motion = useMotionStatus();
  const wakeSnapshot = useWakeLock();
  const wake = { ...describeWakeLock(wakeSnapshot), permission: wakeSnapshot.permission };
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

  // iOS の音フィードバック用: この画面のタップ(許可・準備完了など)で AudioContext を解錠しておく
  useEffect(armAudioUnlock, []);

  const requestMicPermission = () => {
    setPermissions((prev) => ({ ...prev, mic: "granted" }));
  };

  const canRequestMotion = motion.status === "prompt" || motion.status === "unavailable";

  // ユーザー操作を経てからでないと Wake Lock を拒否するブラウザがあるので、このタップで取り直してから進む
  const handleReady = () => {
    void refreshWakeLock();
    onReady();
  };
  const motionHint = motion.error ?? MOTION_HINT[motion.status];

  return (
    <div className="controller-calibration">
      <div className="stage-ambience" aria-hidden="true">
        <div className="stage-ambience__glow stage-ambience__glow--warm" />
        <div className="stage-ambience__glow stage-ambience__glow--cool" />
        <div className="stage-ambience__beams" />
      </div>

      <div className="controller-calibration__content">
        <header className="controller-calibration__header">
          <p className="stage-eyebrow">ペンライトを振ってみよう！</p>
          <h1 className="stage-title">CALIBRATION</h1>
        </header>

      <Panel className="controller-calibration__panel">
        <h2 className="controller-panel-title">許可ステータス</h2>
        <div className="controller-permission-row">
          <span>マイク</span>
          <span className="controller-permission-row__status">{STATUS_LABEL[permissions.mic]}</span>
          <Button variant="secondary" onClick={requestMicPermission}>
            許可する
          </Button>
        </div>
        <div className="controller-permission-row">
          <span>モーションセンサー</span>
          <span
            className={`controller-permission-row__status ${motion.status === "granted" ? "controller-permission-row__status--ok" : ""
              } ${motion.status === "denied" || motion.status === "insecure"
                ? "controller-permission-row__status--error"
                : ""
              }`.trim()}
          >
            {MOTION_STATUS_LABEL[motion.status]}
          </span>
          <Button
            variant="secondary"
            disabled={!canRequestMotion}
            // iOS では requestPermission() をタップハンドラから同期的に呼ぶ必要があるため、間に await を挟まない
            onClick={() => void requestMotionPermission()}
          >
            {motion.status === "granted"
              ? "許可済み"
              : motion.status === "unavailable"
                ? "再試行"
                : "許可する"}
          </Button>
        </div>
        {motionHint && <p className="controller-permission-hint">{motionHint}</p>}
        <div className="controller-permission-row">
          <span>画面ロック抑止</span>
          <span
            className={`controller-permission-row__status ${wake.ok ? "controller-permission-row__status--ok" : ""
              } ${wake.error ? "controller-permission-row__status--error" : ""}`.trim()}
          >
            {wake.label}
          </span>
          <Button
            variant="secondary"
            disabled={!wake.action}
            // iOS では動画の play() をタップハンドラから直接呼ぶ必要があるため、間に await を挟まない
            onClick={() =>
              void (wake.permission === "prompt" ? requestWakeLockPermission() : refreshWakeLock())
            }
          >
            {wake.action ?? "許可済み"}
          </Button>
        </div>
        {wake.hint && <p className="controller-permission-hint">{wake.hint}</p>}
      </Panel>

      <Panel className="controller-calibration__panel">
        <h2 className="controller-panel-title">ペンライトの色</h2>
        <ColorPicker colors={PENLIGHT_PALETTE} selected={color} onSelect={onColorChange} />
      </Panel>

      <Panel className="controller-calibration__panel">
        <h2 className="controller-panel-title">試し振りテスト</h2>
        <ShakeTestArea />
      </Panel>

      <div className="controller-calibration__footer">
        <IconToggleButton
          active={ready}
          onToggle={() => setReady((r) => !r)}
          activeLabel="準備完了しました"
          inactiveLabel="準備完了"
          icon="✓"
        />
        <Button onClick={handleReady} disabled={!ready || !canProceed}>
          ライブへ進む
        </Button>
      </div>

      {import.meta.env.DEV && (
        <Panel className="controller-calibration__panel">
          <h2 className="controller-panel-title">時刻同期(デバッグ)</h2>
          <div className="controller-permission-row">
            <span>
              状態: {serverTime.synced ? "同期済み" : "同期中…"}
              {serverTime.offsetUs !== null && ` / オフセット: ${(serverTime.offsetUs / 1000).toFixed(1)}ms`}
              {serverTime.rttMs !== null && ` / RTT: ${serverTime.rttMs.toFixed(1)}ms`}
            </span>
            <Button variant="secondary" onClick={() => serverTime.resync()}>
              再同期
            </Button>
          </div>
          <p className="controller-permission-hint">
            サーバー時刻: {serverNowUs === null ? "—" : formatServerTimeUs(serverNowUs)}
          </p>
        </Panel>
      )}

        <div className="stage-footer-spacer" aria-hidden="true" />
      </div>

      <div className="stage-ticket">
        <div className="controller-calibration__footer">
          <IconToggleButton
            active={ready}
            onToggle={() => setReady((r) => !r)}
            activeLabel="準備完了しました"
            inactiveLabel="準備完了"
            icon="✓"
          />
        </div>
        <Button onClick={handleReady} disabled={!ready || !canProceed}>
          ライブへ進む
        </Button>
      </div>
    </div>
  );
}
