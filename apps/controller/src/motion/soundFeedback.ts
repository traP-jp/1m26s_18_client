/**
 * Vibration API が使えない環境(iOS Safari)向けの、Web Audio によるサウンドフィードバック。
 * 音声ファイルは使わず、オシレータで短いクリック音を合成する。
 *
 * iOS の制約: AudioContext はユーザー操作(タップ)の中で resume しないと音が出ない。
 * 振りイベントはユーザー操作扱いにならないため、armAudioUnlock() で「最初のタップで解錠」する
 * リスナーを仕込んでおく必要がある(画面のどこかを一度でもタップすれば以降は鳴る)。
 *
 * 既知の制限: iOS はサイレントスイッチ(消音モード)がオンだと Web Audio も消音される。
 */

export type FeedbackKind = "perfect" | "good" | "milestone";

let ctx: AudioContext | null = null;
let unlockArmed = false;

function ensureContext(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/**
 * 最初のタップで AudioContext を作成・resume するリスナーを一度だけ仕込む。
 * 画面マウント時に呼んでおく(複数回呼んでも二重には仕込まれない)。
 */
export function armAudioUnlock() {
  if (unlockArmed || typeof window === "undefined") return;
  unlockArmed = true;

  const unlock = () => {
    const audio = ensureContext();
    if (!audio) return;
    if (audio.state === "suspended") void audio.resume();
    if (audio.state === "running") {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchend", unlock);
    }
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("touchend", unlock, { passive: true });
}

export function isAudioReady(): boolean {
  return ctx?.state === "running";
}

function tone(
  audio: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  peakGain: number,
  type: OscillatorType = "triangle",
) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // クリックノイズを避けるため急峻なアタック + 指数減衰のエンベロープ
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/** フィードバック音を鳴らす。まだ解錠されていない等で鳴らせなければ false */
export function playFeedbackTone(kind: FeedbackKind): boolean {
  const audio = ensureContext();
  if (!audio || audio.state !== "running") return false;

  const now = audio.currentTime;
  switch (kind) {
    case "perfect":
      // Dメジャーの主音チック(D4 + オクターブ上を薄く重ねる)
      tone(audio, 294, now, 0.09, 0.14);
      tone(audio, 587, now, 0.05, 0.04);
      break;
    case "good":
      // 控えめな低めのチック(D3 = PERFECT の 1 オクターブ下)
      tone(audio, 147, now, 0.06, 0.09);
      break;
    case "milestone":
      // コンボ節目: Dメジャーの上昇アルペジオ (D4 → F#4 → A4)
      tone(audio, 294, now, 0.1, 0.12);
      tone(audio, 370, now + 0.07, 0.1, 0.12);
      tone(audio, 440, now + 0.14, 0.16, 0.14);
      break;
  }
  return true;
}
