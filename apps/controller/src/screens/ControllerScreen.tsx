import { useEffect, useRef, useState } from "react";
import { Button, ColorPicker, PENLIGHT_PALETTE, StampPalette } from "ui";
import { STAMPS } from "stamps";
import type { RoomConnection } from "protocol";
import { GlowPanel } from "../components/GlowPanel";
import { VoiceMeter } from "../components/VoiceMeter";
import {
  armAudioUnlock,
  judgeBeatByElapsed,
  playFeedback,
  requestMotionPermission,
  SHAKE_THRESHOLD_PCT,
  useMotionStatus,
  useShake,
  type BeatJudgement,
} from "../motion/useMotion";
import { useLiveBeatPulse } from "../live/useLiveBeatPulse";
import { useLiveClock } from "../live/useLiveClock";
import type { Beat } from "../api/rooms";

export interface ControllerScreenProps {
  color: string;
  onColorChange: (color: string) => void;
  /** 楽曲のビート列。中央値昇順ソート済み。取得完了後のみこの画面を開く */
  beats: readonly Beat[];
  /** 部屋への参加接続。null の間はスタンプを送れない */
  connection: RoomConnection | null;
}

const JUDGEMENT_LABEL: Record<BeatJudgement, string> = {
  perfect: "PERFECT",
  good: "GOOD",
  miss: "MISS",
};

/** この倍数のコンボに到達したら特別な振動パターンを鳴らす */
const COMBO_MILESTONE = 10;

/** スタンプ連打の最小間隔。ホストへの中継を過負荷にしないための保険 */
const STAMP_COOLDOWN_MS = 200;

interface JudgementToast {
  id: number;
  judgement: BeatJudgement;
}

export function ControllerScreen({ color, onColorChange, beats, connection }: ControllerScreenProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [combo, setCombo] = useState(0);
  // useShake のコールバック内で最新のコンボ数を同期的に参照するためのミラー
  const comboRef = useRef(0);
  const [judgement, setJudgement] = useState<JudgementToast | null>(null);
  const judgementTimer = useRef<number | null>(null);
  const motion = useMotionStatus();
  const { getElapsedMs } = useLiveClock();
  const pulse = useLiveBeatPulse(beats);

  // iOS(振動非対応)の音フィードバック用に、最初のタップで AudioContext を解錠する
  useEffect(armAudioUnlock, []);

  useEffect(
    () => () => {
      if (judgementTimer.current) window.clearTimeout(judgementTimer.current);
    },
    [],
  );

  useShake((shake) => {
    if (shake.intensity < SHAKE_THRESHOLD_PCT) return;

    // 正確な再生位置(ライブ開始からの経過時間)に最も近いビートで判定する。
    // 未開始・時刻未同期の間はコンボを維持して無視する
    const elapsedMs = getElapsedMs(shake.onsetTimestamp);
    if (elapsedMs === null) return;

    // 振り始め(しきい値を超えた瞬間)がビートにどれだけ近いかで判定
    const timing = judgeBeatByElapsed(elapsedMs, beats);

    if (timing.judgement === "miss") {
      comboRef.current = 0;
    } else {
      comboRef.current += 1;
      // タイミングが合ったときのフィードバック(Android: 振動 / iOS: クリック音)
      playFeedback(
        comboRef.current % COMBO_MILESTONE === 0 ? "milestone" : timing.judgement,
      );
    }
    setCombo(comboRef.current);

    setJudgement({ id: shake.timestamp, judgement: timing.judgement });
    if (judgementTimer.current) window.clearTimeout(judgementTimer.current);
    judgementTimer.current = window.setTimeout(() => setJudgement(null), 500);
  });

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1200);
  };

  // 直近にスタンプを送った時刻(連打の間引き用)
  const lastStampSentAt = useRef(0);
  const sendStamp = (stampId: number) => {
    if (!connection) {
      showToast("接続中です…");
      return;
    }
    const now = performance.now();
    if (now - lastStampSentAt.current < STAMP_COOLDOWN_MS) return;
    lastStampSentAt.current = now;
    // Stamp は fire-and-forget(サーバーは応答せずストリームを閉じる)
    void connection.request({ type: "stamp", stampId }).catch((error: unknown) => {
      console.warn("failed to send stamp", error);
      showToast("スタンプを送れませんでした");
    });
  };

  return (
    <div className="controller-live">
      <header className="controller-live__header">
        <div
          className={`controller-beat-dot ${pulse ? "controller-beat-dot--pulse" : ""}`.trim()}
        />
        <span
          className={`controller-combo ${combo >= COMBO_MILESTONE ? "controller-combo--hot" : ""}`.trim()}
        >
          COMBO {combo}
        </span>
        {/* キャリブレーションを経由せず直接開いた場合(iOS)向けの許可導線 */}
        {(motion.status === "prompt" || motion.status === "requesting") && (
          <Button
            variant="ghost"
            className="controller-live__motion-button"
            disabled={motion.status === "requesting"}
            onClick={() => void requestMotionPermission()}
          >
            {motion.status === "requesting" ? "確認中…" : "センサーを有効化"}
          </Button>
        )}
      </header>

      {judgement && (
        <span
          key={judgement.id}
          className={`controller-judgement controller-judgement--${judgement.judgement}`}
        >
          {JUDGEMENT_LABEL[judgement.judgement]}
        </span>
      )}

      <GlowPanel color={color} />

      <ColorPicker colors={PENLIGHT_PALETTE} selected={color} onSelect={onColorChange} />

      {STAMPS.length > 0 ? (
        <StampPalette stamps={STAMPS} onSelect={sendStamp} disabled={!connection} />
      ) : (
        <p className="controller-live__stamps-empty">
          スタンプ未取得(`npm run stamps:fetch` を実行してください)
        </p>
      )}

      <div className="controller-live__actions">
        <VoiceMeter />
      </div>

      {toast && <div className="controller-toast">{toast}</div>}
    </div>
  );
}
