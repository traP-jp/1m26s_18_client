import * as THREE from "three";
import type { BoneKey, MmdPoseDriver } from "./MmdPoseDriver";

/** VMD のフレームレート(MMD 固定で 30fps) */
const VMD_FPS = 30;
/** ボーンキーフレーム 1 件のバイト数(名前15 + フレーム4 + 位置12 + 回転16 + 補間64) */
const BONE_FRAME_BYTES = 111;

/**
 * VMD に書き出すボーン。
 * 名前は MMD 標準ボーン名の Shift-JIS バイト列(VMD は Shift-JIS 固定で
 * TextEncoder では作れないため、事前計算した 16 進文字列を埋め込んでいる)。
 * 付与ボーン(左足D など)は MMD 側の付与ランタイムが自動計算するので含めない。
 */
const VMD_BONES: readonly { key: BoneKey; name: string; sjis: Uint8Array }[] = [
  bone("lowerBody", "下半身", "89ba94bc9067"),
  bone("upperBody", "上半身", "8fe394bc9067"),
  bone("head", "頭", "93aa"),
  bone("armL", "左腕", "8db69872"),
  bone("elbowL", "左ひじ", "8db682d082b6"),
  bone("wristL", "左手首", "8db68ee88ef1"),
  bone("armR", "右腕", "89459872"),
  bone("elbowR", "右ひじ", "894582d082b6"),
  bone("wristR", "右手首", "89458ee88ef1"),
  bone("legL", "左足", "8db691ab"),
  bone("kneeL", "左ひざ", "8db682d082b4"),
  bone("ankleL", "左足首", "8db691ab8ef1"),
  bone("legR", "右足", "894591ab"),
  bone("kneeR", "右ひざ", "894582d082b4"),
  bone("ankleR", "右足首", "894591ab8ef1"),
];

function bone(key: BoneKey, name: string, sjisHex: string): { key: BoneKey; name: string; sjis: Uint8Array } {
  const sjis = new Uint8Array(sjisHex.length / 2);
  for (let i = 0; i < sjis.length; i += 1) {
    sjis[i] = Number.parseInt(sjisHex.slice(i * 2, i * 2 + 2), 16);
  }
  return { key, name, sjis };
}

/**
 * ボーンキーフレームの補間パラメータ(64 バイト)。
 * MMD がリニア補間 (20,20,107,107) を保存したときのバイト列と同じもの。
 */
// prettier-ignore
const DEFAULT_INTERPOLATION = new Uint8Array([
  20, 20, 0, 0, 20, 20, 20, 20, 107, 107, 107, 107, 107, 107, 107, 107,
  20, 20, 20, 20, 20, 20, 20, 107, 107, 107, 107, 107, 107, 107, 107, 0,
  20, 20, 20, 20, 20, 20, 107, 107, 107, 107, 107, 107, 107, 107, 0, 0,
  20, 20, 20, 20, 20, 107, 107, 107, 107, 107, 107, 107, 107, 0, 0, 0,
]);

interface RecordedFrame {
  frameNo: number;
  /** VMD_BONES 順に [x, y, z, w] を詰めた three.js 空間のローカル回転 */
  rotations: Float32Array;
}

/**
 * MmdPoseDriver が適用したボーン回転を 30fps のキーフレームとして記録し、
 * VMD (Vocaloid Motion Data 0002) バイナリを生成する。
 *
 * 使い方: start() 後、描画ループから毎フレーム capture(driver, timeMs) を呼ぶ。
 * stop() してから toVmd() でファイル内容を得る。回転のみ(位置キーなし)のモーションになる。
 */
export class VmdMotionRecorder {
  private active = false;
  private startTimeMs = -1;
  private lastFrameNo = -1;
  private presentBoneIndices: number[] | null = null;
  private frames: RecordedFrame[] = [];
  private readonly quat = new THREE.Quaternion();

  get isRecording(): boolean {
    return this.active;
  }

  /** 記録済みキーフレーム数(フレーム数 × ボーン数ではなくフレーム数) */
  get frameCount(): number {
    return this.frames.length;
  }

  get durationSeconds(): number {
    return this.lastFrameNo >= 0 ? this.lastFrameNo / VMD_FPS : 0;
  }

  /** 記録を開始する(以前の記録内容は破棄) */
  start(): void {
    this.frames = [];
    this.startTimeMs = -1;
    this.lastFrameNo = -1;
    this.presentBoneIndices = null;
    this.active = true;
  }

  stop(): void {
    this.active = false;
  }

  /**
   * 現在のボーン姿勢を 1 フレームとして記録する。
   * driver.apply() の直後に描画ループから呼ぶこと。録画中でなければ何もしない。
   * 30fps のフレーム番号に丸め、同一フレームへの重複記録はスキップする。
   */
  capture(driver: MmdPoseDriver, timeMs: number): void {
    if (!this.active) return;
    if (this.presentBoneIndices === null) {
      const present: number[] = [];
      for (let i = 0; i < VMD_BONES.length; i += 1) {
        if (driver.readLocalRotation(VMD_BONES[i].key, this.quat)) present.push(i);
      }
      this.presentBoneIndices = present;
    }
    if (this.startTimeMs < 0) this.startTimeMs = timeMs;
    const frameNo = Math.round((timeMs - this.startTimeMs) * (VMD_FPS / 1000));
    if (frameNo <= this.lastFrameNo) return;
    this.lastFrameNo = frameNo;

    const rotations = new Float32Array(VMD_BONES.length * 4);
    for (const i of this.presentBoneIndices) {
      driver.readLocalRotation(VMD_BONES[i].key, this.quat);
      rotations[i * 4] = this.quat.x;
      rotations[i * 4 + 1] = this.quat.y;
      rotations[i * 4 + 2] = this.quat.z;
      rotations[i * 4 + 3] = this.quat.w;
    }
    this.frames.push({ frameNo, rotations });
  }

  /** 記録内容から VMD ファイルのバイト列を生成する */
  toVmd(modelName = "pose capture"): Uint8Array<ArrayBuffer> {
    const present = this.presentBoneIndices ?? [];
    const keyframeCount = this.frames.length * present.length;
    // ヘッダ30 + モデル名20 + ボーン数4 + キーフレーム + 末尾のセクション数
    // (モーフ / カメラ / 照明 / セルフ影 / IK・表示 の 0 件カウント × 5)
    const byteLength = 30 + 20 + 4 + keyframeCount * BONE_FRAME_BYTES + 4 * 5;
    const buffer = new ArrayBuffer(byteLength);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    writeAscii(bytes, 0, "Vocaloid Motion Data 0002");
    writeAscii(bytes, 30, modelName.slice(0, 20));
    view.setUint32(50, keyframeCount, true);

    let offset = 54;
    for (const frame of this.frames) {
      for (const i of present) {
        bytes.set(VMD_BONES[i].sjis, offset); // 15 バイト、残りは 0 のまま
        view.setUint32(offset + 15, frame.frameNo, true);
        // 位置 (offset+19..30) は 0 = 回転のみのモーション
        // three.js(右手系) → MMD(左手系): クォータニオンは x, y を反転
        view.setFloat32(offset + 31, -frame.rotations[i * 4], true);
        view.setFloat32(offset + 35, -frame.rotations[i * 4 + 1], true);
        view.setFloat32(offset + 39, frame.rotations[i * 4 + 2], true);
        view.setFloat32(offset + 43, frame.rotations[i * 4 + 3], true);
        bytes.set(DEFAULT_INTERPOLATION, offset + 47);
        offset += BONE_FRAME_BYTES;
      }
    }
    // 末尾の各セクションは 0 件(ArrayBuffer は 0 初期化なので書き込み不要)
    return bytes;
  }
}

/** ASCII 文字列を固定長フィールドへ書く(非 ASCII は '?')。残りは 0 埋めのまま。 */
function writeAscii(out: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    out[offset + i] = code <= 0x7f ? code : 0x3f;
  }
}
