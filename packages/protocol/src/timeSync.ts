import { epochNowMs } from "./connection";
import type { RoomConnection } from "./connection";

/**
 * 時刻同期の計測(NTP 風の TimeSyncRequest/TimeSyncResponse 交換)。
 *
 * サーバーは TimeSyncRequest に対して t1(受信時刻)と t2(応答書込直前)を
 * unix µs で返し、クライアントは t0(送信直前)と t3(受信直後)を記録する。
 * 往復路が対称と仮定すると、サーバー時計とクライアント時計の差は
 * offset = ((t1 - t0) + (t2 - t3)) / 2 で推定できる。
 */

const US_PER_MS = 1000;

/** 1 回の計測で `synchronizeTime()` が送る TimeSyncRequest の回数 */
export const TIME_SYNC_SAMPLE_COUNT = 5;

/** 1 回分の時刻同期の計測結果。時刻はすべて unix µs */
export interface TimeSyncSample {
  /** クライアントの送信直前時刻 (クライアント時計) */
  readonly t0: number;
  /** サーバーの受信時刻 (サーバー時計) */
  readonly t1: number;
  /** サーバーの応答書込直前時刻 (サーバー時計) */
  readonly t2: number;
  /** クライアントの受信直後時刻 (クライアント時計) */
  readonly t3: number;
}

/**
 * 補正済みのサーバー時計。最小 RTT のサンプルから作り、時刻変換に使う。
 */
export class ServerClock {
  readonly #sample: TimeSyncSample;
  readonly #offsetUs: number;
  readonly #rttUs: number;

  constructor(sample: TimeSyncSample) {
    this.#sample = sample;
    this.#offsetUs = ((sample.t1 - sample.t0) + (sample.t2 - sample.t3)) / 2;
    this.#rttUs = sample.t3 - sample.t0;
  }

  /** 同期に使ったサンプル(最小 RTT のもの) */
  get sample(): TimeSyncSample {
    return this.#sample;
  }

  /** サーバー時計とクライアント時計の差 (サーバー − クライアント, µs) */
  get offsetUs(): number {
    return this.#offsetUs;
  }

  /** 同期に使ったサンプルの往復時間 (ms) */
  get rttMs(): number {
    return this.#rttUs / US_PER_MS;
  }

  /** 現在の推定サーバー時刻 (unix µs) */
  nowUs(): number {
    return clientNowUs() + this.#offsetUs;
  }

  /** サーバー時刻 (unix µs) をローカル時刻 (performance.now() 基準, ms) に変換する */
  serverTimeToLocalMs(serverTimeUs: number): number {
    return serverTimeUs / US_PER_MS - this.#offsetUs / US_PER_MS - performance.timeOrigin;
  }

  /** ローカル時刻 (performance.now() 基準, ms) をサーバー時刻 (unix µs) に変換する */
  localMsToServerTime(localMs: number): number {
    return (performance.timeOrigin + localMs) * US_PER_MS + this.#offsetUs;
  }
}

/**
 * TimeSyncRequest を `sampleCount` 回送り、最も RTT の小さいサンプルから
 * サーバー時計を作る。同期に失敗した場合は例外を投げる。
 */
export async function synchronizeTime(
  connection: RoomConnection,
  sampleCount: number = TIME_SYNC_SAMPLE_COUNT,
): Promise<ServerClock> {
  if (!Number.isInteger(sampleCount) || sampleCount < 1) {
    throw new Error(`sampleCount は 1 以上の整数である必要があります: ${sampleCount}`);
  }
  let best = await measureSample(connection);
  for (let i = 1; i < sampleCount; i += 1) {
    const sample = await measureSample(connection);
    if (sample.t3 - sample.t0 < best.t3 - best.t0) {
      best = sample;
    }
  }
  return new ServerClock(best);
}

async function measureSample(connection: RoomConnection): Promise<TimeSyncSample> {
  const { response, sentAtMs, receivedAtMs } = await connection.requestTimed({
    type: "timeSyncRequest",
  });
  if (response === null) {
    throw new Error("時刻同期が中断されました(接続が閉じられました)");
  }
  if (response.type === "error") {
    throw new Error(response.message);
  }
  if (response.type !== "timeSyncResponse") {
    throw new Error(`時刻同期への想定外の応答: ${response.type}`);
  }
  return {
    t0: sentAtMs * US_PER_MS,
    t1: response.t1,
    t2: response.t2,
    t3: receivedAtMs * US_PER_MS,
  };
}

/** クライアント時計の現在時刻 (unix µs)。t0/t3 と同じ基準 */
function clientNowUs(): number {
  return epochNowMs() * US_PER_MS;
}
