/**
 * DeviceMotionEvent の許可フローとリスナー管理を担うアプリ全体で 1 つのシングルトン。
 *
 * ブラウザごとの違い:
 * - iOS 13+ Safari: `DeviceMotionEvent.requestPermission()` をユーザー操作(タップ)の中で呼ぶ必要があり、
 *   さらに HTTPS(セキュアコンテキスト)でないとセンサー自体が無効。
 *   一度 "denied" になると、Safari を再起動するか 設定 > Safari > 「モーションと画面の向きのアクセス」を
 *   切り替えるまで再プロンプトできない。
 * - Android Chrome: 許可 API は無く、リスナーを付ければすぐイベントが来る。
 * - PC ブラウザ: DeviceMotionEvent は定義されているがイベントは一切来ない → 一定時間で "unavailable" 扱い。
 */
import { ShakeDetector, type MotionSample, type ShakeEvent } from "./shakeDetector";

export type MotionStatus =
  /** DeviceMotionEvent が存在しないブラウザ */
  | "unsupported"
  /** http 等の非セキュアコンテキスト。iOS ではセンサーが無効になる */
  | "insecure"
  /** 未許可。ユーザー操作から requestPermission() を呼ぶ必要がある */
  | "prompt"
  /** 許可ダイアログ表示中 */
  | "requesting"
  /** 許可済み(またはAndroid等で許可不要)。イベント受信中 */
  | "granted"
  /** ユーザーが拒否した */
  | "denied"
  /** 許可はあるが有効なイベントが来ない(PC など) */
  | "unavailable";

export interface MotionSnapshot {
  status: MotionStatus;
  /** requestPermission が例外を投げた場合などの補足メッセージ */
  error: string | null;
  /** iOS のように明示的な許可操作が必要な環境か */
  needsUserGesture: boolean;
}

type PermissionResult = "granted" | "denied";
type DeviceMotionEventCtor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<PermissionResult>;
};

/** 有効なイベントがこの時間来なければ "unavailable" とみなす */
const AVAILABILITY_TIMEOUT_MS = 1500;

type Listener<T> = (value: T) => void;

class MotionSensor {
  private snapshot: MotionSnapshot;
  private readonly detector = new ShakeDetector();
  private listening = false;
  private availabilityTimer: number | null = null;
  private receivedValidEvent = false;

  private readonly statusListeners = new Set<Listener<MotionSnapshot>>();
  private readonly sampleListeners = new Set<Listener<MotionSample>>();
  private readonly shakeListeners = new Set<Listener<ShakeEvent>>();

  constructor() {
    this.snapshot = {
      status: this.initialStatus(),
      error: null,
      needsUserGesture: this.hasPermissionApi(),
    };
  }

  getSnapshot = (): MotionSnapshot => this.snapshot;

  subscribeStatus = (listener: Listener<MotionSnapshot>) => {
    this.statusListeners.add(listener);
    return () => void this.statusListeners.delete(listener);
  };

  subscribeSample = (listener: Listener<MotionSample>) => {
    this.sampleListeners.add(listener);
    return () => void this.sampleListeners.delete(listener);
  };

  subscribeShake = (listener: Listener<ShakeEvent>) => {
    this.shakeListeners.add(listener);
    return () => void this.shakeListeners.delete(listener);
  };

  /**
   * 許可 API が無い環境(Android Chrome / PC)ではユーザー操作なしに開始できるので、
   * アプリ起動時に呼んでおくと Calibration 画面を開いた時点でステータスが確定する。
   */
  autoStart() {
    if (this.snapshot.status !== "prompt" || this.hasPermissionApi()) return;
    this.start();
    this.setSnapshot({ status: "granted", error: null });
  }

  /**
   * 許可をリクエストしてリスニングを開始する。
   * iOS ではタップ等のユーザー操作ハンドラ内から同期的に呼ぶこと(await を挟むと NotAllowedError になる)。
   */
  async requestPermission(): Promise<MotionStatus> {
    const { status } = this.snapshot;
    if (status === "unsupported" || status === "insecure" || status === "requesting") {
      return status;
    }
    if (status === "granted") return status;

    if (!this.hasPermissionApi()) {
      this.start();
      this.setSnapshot({ status: "granted", error: null });
      return "granted";
    }

    this.setSnapshot({ status: "requesting", error: null });
    try {
      const result = await (DeviceMotionEvent as DeviceMotionEventCtor).requestPermission!();
      if (result === "granted") {
        this.start();
        this.setSnapshot({ status: "granted", error: null });
      } else {
        this.setSnapshot({ status: "denied", error: null });
      }
    } catch (err) {
      // ユーザー操作の外で呼ばれた場合などに NotAllowedError が投げられる。拒否とは区別して再試行可能にする
      console.error("DeviceMotionEvent.requestPermission failed", err);
      this.setSnapshot({
        status: "prompt",
        error: "許可ダイアログを表示できませんでした。ボタンをもう一度タップしてください。",
      });
    }
    return this.snapshot.status;
  }

  stop() {
    if (!this.listening) return;
    window.removeEventListener("devicemotion", this.handleMotion);
    this.listening = false;
    this.clearAvailabilityTimer();
    this.detector.reset();
  }

  private start() {
    if (this.listening) return;
    this.listening = true;
    this.receivedValidEvent = false;
    this.detector.reset();
    window.addEventListener("devicemotion", this.handleMotion);
    this.availabilityTimer = window.setTimeout(() => {
      this.availabilityTimer = null;
      if (!this.receivedValidEvent) {
        this.setSnapshot({ status: "unavailable", error: null });
      }
    }, AVAILABILITY_TIMEOUT_MS);
  }

  private handleMotion = (event: DeviceMotionEvent) => {
    const result = this.detector.process(event);
    if (!result) return;

    if (!this.receivedValidEvent) {
      this.receivedValidEvent = true;
      this.clearAvailabilityTimer();
      if (this.snapshot.status !== "granted") {
        this.setSnapshot({ status: "granted", error: null });
      }
    }

    for (const listener of this.sampleListeners) listener(result.sample);
    if (result.shake) {
      for (const listener of this.shakeListeners) listener(result.shake);
    }
  };

  private setSnapshot(patch: Partial<MotionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.statusListeners) listener(this.snapshot);
  }

  private clearAvailabilityTimer() {
    if (this.availabilityTimer !== null) {
      window.clearTimeout(this.availabilityTimer);
      this.availabilityTimer = null;
    }
  }

  private hasPermissionApi(): boolean {
    return (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof (DeviceMotionEvent as DeviceMotionEventCtor).requestPermission === "function"
    );
  }

  private initialStatus(): MotionStatus {
    if (typeof window === "undefined" || typeof DeviceMotionEvent === "undefined") {
      return "unsupported";
    }
    if (!window.isSecureContext) return "insecure";
    return "prompt";
  }
}

export const motionSensor = new MotionSensor();
