import { useEffect, useRef, useState } from "react";
import { Button, ColorPicker, PENLIGHT_PALETTE } from "ui";
import { Penlight3D } from "../components/Penlight3D";
import { VoiceMeter } from "../components/VoiceMeter";
import {
  armAudioUnlock,
  judgeBeatTiming,
  playFeedback,
  requestMotionPermission,
  SHAKE_THRESHOLD_PCT,
  useBeatClock,
  useMotionStatus,
  useShake,
  type BeatJudgement,
} from "../motion/useMotion";
import { mockBpm } from "../mockData";

export interface ControllerScreenProps {
  color: string;
  onColorChange: (color: string) => void;
}

const JUDGEMENT_LABEL: Record<BeatJudgement, string> = {
  perfect: "PERFECT",
  good: "GOOD",
  miss: "MISS",
};

/** この倍数のコンボに到達したら特別な振動パターンを鳴らす */
const COMBO_MILESTONE = 10;

interface JudgementToast {
  id: number;
  judgement: BeatJudgement;
}

export function ControllerScreen({ color, onColorChange }: ControllerScreenProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [combo, setCombo] = useState(0);
  // useShake のコールバック内で最新のコンボ数を同期的に参照するためのミラー
  const comboRef = useRef(0);
  const [judgement, setJudgement] = useState<JudgementToast | null>(null);
  const judgementTimer = useRef<number | null>(null);
  const motion = useMotionStatus();
  // TODO: WebSocket 実装後は mockBpm ではなく楽曲の BPM と、サーバー基準の再生位置から作った時計を使う
  const { clock, pulse } = useBeatClock(mockBpm);

  // iOS(振動非対応)の音フィードバック用に、最初のタップで AudioContext を解錠する
  useEffect(armAudioUnlock, []);

  useShake((shake) => {
    if (shake.intensity < SHAKE_THRESHOLD_PCT) return;

    // 振り始め(しきい値を超えた瞬間)がビートにどれだけ近いかで判定
    const timing = judgeBeatTiming(shake.onsetTimestamp, clock);

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

    // TODO: WebSocket 実装後、ここで { type: "shake", intensity, judgement, offsetMs } をサーバーへ送信する
  });

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1200);
  };

  return (
    <div className="controller-live">
      {/* 本番中は毎フレーム描く演出(conic-gradientのビーム)を避け、静的なグロー
          2枚だけに留めてバッテリー消費を抑える */}
      <div className="stage-ambience" aria-hidden="true">
        <div className="stage-ambience__glow stage-ambience__glow--warm" />
        <div className="stage-ambience__glow stage-ambience__glow--cool" />
      </div>

      <div className="controller-live__content">
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

        <Penlight3D color={color} />

        <ColorPicker colors={PENLIGHT_PALETTE} selected={color} onSelect={onColorChange} />

        <div className="controller-live__actions">
          <Button variant="secondary" onClick={() => showToast("スタンプを送信しました(仮)")}>
            スタンプ
          </Button>
          <Button variant="secondary" onClick={() => showToast("風船を送信しました(仮)")}>
            風船
          </Button>
          <VoiceMeter />
        </div>

        {toast && <div className="controller-toast">{toast}</div>}
      </div>
    </div>
  );
}
