/**
 * DeviceMotionEvent の加速度から「ペンライトを振った」動作を検出する純粋ロジック。
 * ブラウザ API への依存は DeviceMotionEvent の型のみで、テスト・チューニングしやすいように
 * React やイベントリスナーからは切り離してある。
 */

export interface MotionSample {
  /** 重力除去後の直線加速度の大きさ (m/s^2) */
  magnitude: number;
  /** 0–100 に正規化した振り強度。減衰付きエンベロープなのでメーター表示にそのまま使える */
  intensity: number;
  timestamp: number;
}

export interface ShakeEvent {
  /** ピーク時の強度 (0–100) */
  intensity: number;
  /** ピーク時の加速度 (m/s^2) */
  peakMagnitude: number;
  /** ショット確定時刻 (performance.now() 基準)。ピーク検出のため onset より 30–80ms 遅れる */
  timestamp: number;
  /** しきい値を超えた瞬間 = 振り始めの時刻。ビート同期の判定にはこちらを使う */
  onsetTimestamp: number;
}

/** この加速度 (m/s^2) を 100% とみなす。ペンライトを強めに振ると 20–30 m/s^2 程度になる */
export const MAX_MAGNITUDE = 20;
/** この強度 (%) を超えたら「1回振った」と判定する。ShakeTestArea のしきい値ラインもこれに合わせる */
export const SHAKE_THRESHOLD_PCT = 55;

const SHAKE_THRESHOLD = (MAX_MAGNITUDE * SHAKE_THRESHOLD_PCT) / 100;
/** しきい値を超えたあと、しきい値×この比率まで下がったらショットを確定する(ピーク検出) */
const RELEASE_RATIO = 0.6;
/** しきい値超えが長く続いても、この時間で一旦ショットを確定して次に備える */
const MAX_HOLD_MS = 350;
/** 連続判定の最短間隔。240BPM の 16 分は無理でも 8 分(8 回/秒)は拾える程度 */
const COOLDOWN_MS = 120;
/** メーター用エンベロープの減衰速度 (%/秒) */
const ENVELOPE_DECAY_PER_SEC = 220;
/** accelerationIncludingGravity から重力成分を推定するローパスフィルタ係数 */
const GRAVITY_LPF_ALPHA = 0.95;

type Vec3 = readonly [number, number, number];

function readVec(
  acc: DeviceMotionEventAcceleration | null | undefined,
): Vec3 | null {
  if (!acc || acc.x == null || acc.y == null || acc.z == null) return null;
  return [acc.x, acc.y, acc.z];
}

export function magnitudeToIntensity(magnitude: number): number {
  return Math.max(0, Math.min(100, (magnitude / MAX_MAGNITUDE) * 100));
}

export class ShakeDetector {
  private gravity: Vec3 | null = null;
  private envelope = 0;
  private lastTs: number | null = null;

  private above = false;
  private aboveSince = 0;
  private peak = 0;
  private lastShakeTs = -Infinity;

  /**
   * 1 イベント分を処理する。加速度が取れないイベント(全て null)の場合は null を返す。
   * Chrome では permissions-policy でブロックされているとイベントは来るが値が null になる。
   */
  process(
    event: Pick<DeviceMotionEvent, "acceleration" | "accelerationIncludingGravity">,
    now: number = performance.now(),
  ): { sample: MotionSample; shake: ShakeEvent | null } | null {
    const linear = this.linearAcceleration(event);
    if (!linear) return null;

    const magnitude = Math.hypot(linear[0], linear[1], linear[2]);
    const dt = this.lastTs == null ? 0 : Math.max(0, (now - this.lastTs) / 1000);
    this.lastTs = now;

    const instant = magnitudeToIntensity(magnitude);
    this.envelope = Math.max(instant, this.envelope - ENVELOPE_DECAY_PER_SEC * dt);

    const sample: MotionSample = { magnitude, intensity: this.envelope, timestamp: now };
    return { sample, shake: this.detectShake(magnitude, now) };
  }

  reset() {
    this.gravity = null;
    this.envelope = 0;
    this.lastTs = null;
    this.above = false;
    this.peak = 0;
    this.lastShakeTs = -Infinity;
  }

  private linearAcceleration(
    event: Pick<DeviceMotionEvent, "acceleration" | "accelerationIncludingGravity">,
  ): Vec3 | null {
    // 重力除去済みの値が取れる端末(iOS Safari / Android Chrome)はそのまま使う
    const linear = readVec(event.acceleration);
    if (linear) return linear;

    // acceleration が null の端末(一部の Android ブラウザ)は重力込みの値から重力を推定して引く
    const withGravity = readVec(event.accelerationIncludingGravity);
    if (!withGravity) return null;

    if (!this.gravity) {
      this.gravity = withGravity;
      return [0, 0, 0];
    }
    const g = this.gravity;
    const a = GRAVITY_LPF_ALPHA;
    this.gravity = [
      a * g[0] + (1 - a) * withGravity[0],
      a * g[1] + (1 - a) * withGravity[1],
      a * g[2] + (1 - a) * withGravity[2],
    ];
    return [
      withGravity[0] - this.gravity[0],
      withGravity[1] - this.gravity[1],
      withGravity[2] - this.gravity[2],
    ];
  }

  /**
   * しきい値を上回ってから下回るまでを 1 ショットとし、その間のピーク値で強度を決める。
   * 立ち上がりで即発火するより 30–80ms ほど遅れるが、強さの精度が上がる。
   */
  private detectShake(magnitude: number, now: number): ShakeEvent | null {
    if (!this.above) {
      if (magnitude >= SHAKE_THRESHOLD && now - this.lastShakeTs >= COOLDOWN_MS) {
        this.above = true;
        this.aboveSince = now;
        this.peak = magnitude;
      }
      return null;
    }

    this.peak = Math.max(this.peak, magnitude);
    const released = magnitude < SHAKE_THRESHOLD * RELEASE_RATIO;
    const heldTooLong = now - this.aboveSince >= MAX_HOLD_MS;
    if (!released && !heldTooLong) return null;

    this.above = false;
    this.lastShakeTs = now;
    return {
      intensity: magnitudeToIntensity(this.peak),
      peakMagnitude: this.peak,
      timestamp: now,
      onsetTimestamp: this.aboveSince,
    };
  }
}
