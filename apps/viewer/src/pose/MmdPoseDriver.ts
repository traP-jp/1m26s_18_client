import * as THREE from "three";
import { LM, type PoseFrame } from "./landmarks";

export interface MmdPoseDriverOptions {
  /**
   * true なら鏡写し(ユーザーの右手を上げると画面右側=モデルの左腕が上がる)。
   * false ならモデルはユーザーと同じ側の腕を動かす(向かい合った人を真似る動き)。
   */
  mirror?: boolean;
  /** 0..1。1で即時追従、小さいほど滑らか(かつ遅延)。 */
  smoothing?: number;
  /** この visibility 未満のランドマークを含むボーンは更新しない。 */
  minVisibility?: number;
}

/**
 * ボーン名の候補。three-mmd-loader は `englishName || name` を THREE.Bone.name にするため
 * 英語名を優先しつつ日本語名でもフォールバックする。
 * このモデルには "arm_L" などの英語名が複数ボーンに重複して付いているが、
 * 本体ボーンがスケルトン順で先に現れるので「最初に見つかったもの」を採用する。
 */
const BONE_NAMES = {
  lowerBody: ["lower body", "下半身"],
  upperBody: ["upper body", "上半身"],
  head: ["head", "頭"],
  armL: ["arm_L", "左腕"],
  elbowL: ["elbow_L", "左ひじ"],
  wristL: ["wrist_L", "左手首"],
  middleL: ["middle1_L", "左中指１"],
  armR: ["arm_R", "右腕"],
  elbowR: ["elbow_R", "右ひじ"],
  wristR: ["wrist_R", "右手首"],
  middleR: ["middle1_R", "右中指１"],
  legL: ["leg_L", "左足"],
  kneeL: ["knee_L", "左ひざ"],
  ankleL: ["ankle_L", "左足首"],
  toeL: ["toe_L", "左つま先"],
  legR: ["leg_R", "右足"],
  kneeR: ["knee_R", "右ひざ"],
  ankleR: ["ankle_R", "右足首"],
  toeR: ["toe_R", "右つま先"],
  // 付与(append)ボーン。足の頂点はこちらにウェイトが乗っているため、
  // ランタイムを通さず直接ボーンを動かす場合は本体ボーンの回転をコピーする必要がある。
  legDL: ["left thigh_D", "左足D"],
  kneeDL: ["left knee_D", "左ひざD"],
  ankleDL: ["left foot_D", "左足首D"],
  legDR: ["right thigh_D", "右足D"],
  kneeDR: ["right knee_D", "右ひざD"],
  ankleDR: ["right foot_D", "右足首D"],
} as const;

export type BoneKey = keyof typeof BONE_NAMES;

/** 「ボーン → 子ボーン」方向を「ランドマークA → B」方向に合わせる */
interface DirectionRule {
  bone: BoneKey;
  child: BoneKey;
  from: LandmarkSide;
  to: LandmarkSide;
}

/** 左右対称のランドマーク(mirror 時に入れ替える) */
type LandmarkSide = readonly [left: number, right: number] | number;

/** 直接指定は単一 index、左右ペアは [left, right] で "L" or "R" を選ぶ */
const L = (l: number, r: number): [number, number] => [l, r];

const DIRECTION_RULES: readonly (DirectionRule & { side: "L" | "R" })[] = [
  { side: "L", bone: "armL", child: "elbowL", from: L(LM.leftShoulder, LM.rightShoulder), to: L(LM.leftElbow, LM.rightElbow) },
  { side: "L", bone: "elbowL", child: "wristL", from: L(LM.leftElbow, LM.rightElbow), to: L(LM.leftWrist, LM.rightWrist) },
  { side: "L", bone: "wristL", child: "middleL", from: L(LM.leftWrist, LM.rightWrist), to: L(LM.leftIndex, LM.rightIndex) },
  { side: "R", bone: "armR", child: "elbowR", from: L(LM.leftShoulder, LM.rightShoulder), to: L(LM.leftElbow, LM.rightElbow) },
  { side: "R", bone: "elbowR", child: "wristR", from: L(LM.leftElbow, LM.rightElbow), to: L(LM.leftWrist, LM.rightWrist) },
  { side: "R", bone: "wristR", child: "middleR", from: L(LM.leftWrist, LM.rightWrist), to: L(LM.leftIndex, LM.rightIndex) },
  { side: "L", bone: "legL", child: "kneeL", from: L(LM.leftHip, LM.rightHip), to: L(LM.leftKnee, LM.rightKnee) },
  { side: "L", bone: "kneeL", child: "ankleL", from: L(LM.leftKnee, LM.rightKnee), to: L(LM.leftAnkle, LM.rightAnkle) },
  { side: "L", bone: "ankleL", child: "toeL", from: L(LM.leftAnkle, LM.rightAnkle), to: L(LM.leftFootIndex, LM.rightFootIndex) },
  { side: "R", bone: "legR", child: "kneeR", from: L(LM.leftHip, LM.rightHip), to: L(LM.leftKnee, LM.rightKnee) },
  { side: "R", bone: "kneeR", child: "ankleR", from: L(LM.leftKnee, LM.rightKnee), to: L(LM.leftAnkle, LM.rightAnkle) },
  { side: "R", bone: "ankleR", child: "toeR", from: L(LM.leftAnkle, LM.rightAnkle), to: L(LM.leftFootIndex, LM.rightFootIndex) },
];

const APPEND_COPY: readonly (readonly [source: BoneKey, target: BoneKey])[] = [
  ["legL", "legDL"],
  ["kneeL", "kneeDL"],
  ["ankleL", "ankleDL"],
  ["legR", "legDR"],
  ["kneeR", "kneeDR"],
  ["ankleR", "ankleDR"],
];

interface BoneEntry {
  bone: THREE.Bone;
  /** 全ボーン回転が単位のときの、メッシュ空間での位置(バインドポーズ) */
  restPosition: THREE.Vector3;
  /** ドライバ生成時の回転(reset で戻す) */
  initialQuaternion: THREE.Quaternion;
}

/**
 * MediaPipe のワールドランドマークから MMD モデルのボーン回転を直接計算して適用する。
 *
 * three-mmd-loader のランタイム(`model.update()`)は通さない。ランタイムは毎フレーム
 * ボーンを VMD の評価結果で上書きするため、このドライバを使う間は update() を呼ばないこと。
 * IK・付与・物理も走らないので、足の付与ボーン(〜D)には本体の回転を手動でコピーしている。
 */
export class MmdPoseDriver {
  private readonly mesh: THREE.SkinnedMesh;
  private readonly bones = new Map<BoneKey, BoneEntry>();
  private mirror: boolean;
  private smoothing: number;
  private minVisibility: number;

  // 作業用(毎フレームの割り当てを避ける)
  private readonly meshWorldQuatInv = new THREE.Quaternion();
  private readonly parentWorldQuat = new THREE.Quaternion();
  private readonly targetLocal = new THREE.Quaternion();
  private readonly v0 = new THREE.Vector3();
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly restDir = new THREE.Vector3();
  private readonly targetDir = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();

  readonly missingBones: readonly string[];

  constructor(mesh: THREE.SkinnedMesh, options: MmdPoseDriverOptions = {}) {
    this.mesh = mesh;
    this.mirror = options.mirror ?? true;
    this.smoothing = options.smoothing ?? 0.45;
    this.minVisibility = options.minVisibility ?? 0.5;

    const skeletonBones = mesh.skeleton.bones;
    const restCache = new Map<THREE.Bone, THREE.Vector3>();
    const restPositionOf = (bone: THREE.Bone): THREE.Vector3 => {
      const cached = restCache.get(bone);
      if (cached) return cached;
      const pos = bone.position.clone();
      if (bone.parent instanceof THREE.Bone) pos.add(restPositionOf(bone.parent));
      restCache.set(bone, pos);
      return pos;
    };

    const missing: string[] = [];
    for (const key of Object.keys(BONE_NAMES) as BoneKey[]) {
      const candidates: readonly string[] = BONE_NAMES[key];
      const bone = skeletonBones.find((b) => candidates.includes(b.name));
      if (!bone) {
        missing.push(candidates[0]);
        continue;
      }
      this.bones.set(key, {
        bone,
        restPosition: restPositionOf(bone),
        initialQuaternion: bone.quaternion.clone(),
      });
    }
    this.missingBones = missing;
  }

  setMirror(mirror: boolean): void {
    this.mirror = mirror;
  }

  setSmoothing(smoothing: number): void {
    this.smoothing = THREE.MathUtils.clamp(smoothing, 0.01, 1);
  }

  /**
   * VMD 出力用: ボーンの現在のローカル回転(ドライバ生成時の回転からの相対)を out に書く。
   * PMX のバインドポーズはローカル回転が単位なので、これがそのまま VMD の回転値になる。
   * ボーンがモデルに存在しなければ false を返す。
   */
  readLocalRotation(key: BoneKey, out: THREE.Quaternion): boolean {
    const entry = this.bones.get(key);
    if (!entry) return false;
    out.copy(entry.initialQuaternion).invert().multiply(entry.bone.quaternion);
    return true;
  }

  /** ドライバ生成時の回転に戻す(姿勢推定を止めたときに呼ぶ) */
  reset(): void {
    for (const entry of this.bones.values()) {
      entry.bone.quaternion.copy(entry.initialQuaternion);
    }
    this.mesh.updateMatrixWorld(true);
  }

  /** 1フレーム分のランドマークをボーンに適用する */
  apply(frame: PoseFrame): void {
    if (frame.length < 33) return;

    this.mesh.getWorldQuaternion(this.meshWorldQuatInv).invert();

    // 親から順に。姿勢(basis)系 → 方向(direction)系。
    this.applyTorso(frame);
    this.applyHead(frame);
    for (const rule of DIRECTION_RULES) {
      this.applyDirection(frame, rule);
    }
    for (const [source, target] of APPEND_COPY) {
      const src = this.bones.get(source);
      const dst = this.bones.get(target);
      if (src && dst) dst.bone.quaternion.copy(src.bone.quaternion);
    }

    this.mesh.updateMatrixWorld(true);
  }

  // ---- 座標変換 ----------------------------------------------------------

  /**
   * MediaPipe world 座標 → モデル(メッシュ)座標。
   * MediaPipe: x右 / y下 / z奥。three(このローダーの出力): x=モデルの左 / y上 / z=モデルの正面。
   * カメラに向かう人の「左」は画像の右(+x)なので x はそのまま、y と z は反転。mirror 時は x も反転。
   */
  private landmark(frame: PoseFrame, side: LandmarkSide, out: THREE.Vector3): number {
    const index = typeof side === "number" ? side : this.mirror ? side[1] : side[0];
    const lm = frame[index];
    out.set(this.mirror ? -lm.x : lm.x, -lm.y, -lm.z);
    return lm.visibility;
  }

  private landmarkFor(frame: PoseFrame, side: LandmarkSide, wantSide: "L" | "R", out: THREE.Vector3): number {
    if (typeof side === "number") return this.landmark(frame, side, out);
    // wantSide はモデル側の左右。mirror ならユーザーの逆側のランドマークを使う。
    const useLeft = this.mirror ? wantSide === "R" : wantSide === "L";
    const lm = frame[useLeft ? side[0] : side[1]];
    out.set(this.mirror ? -lm.x : lm.x, -lm.y, -lm.z);
    return lm.visibility;
  }

  /** メッシュ空間での親ボーンのワールド回転 */
  private parentWorldQuaternion(bone: THREE.Bone, out: THREE.Quaternion): THREE.Quaternion {
    const parent = bone.parent;
    if (parent instanceof THREE.Object3D) {
      parent.getWorldQuaternion(out);
      out.premultiply(this.meshWorldQuatInv);
    } else {
      out.identity();
    }
    return out;
  }

  /** ワールド(メッシュ空間)での目標回転を、そのボーンのローカル回転へ落としてスムージング適用 */
  private applyWorldRotation(entry: BoneEntry, worldTarget: THREE.Quaternion): void {
    this.parentWorldQuaternion(entry.bone, this.parentWorldQuat);
    this.targetLocal.copy(this.parentWorldQuat).invert().multiply(worldTarget);
    entry.bone.quaternion.slerp(this.targetLocal, this.smoothing);
  }

  // ---- 各部位 --------------------------------------------------------------

  /**
   * 上半身/下半身: 「左方向」と「上方向」の2軸から基底を作って回転を出す。
   * レスト姿勢では left=+x, up=+y, forward=+z。
   */
  private applyTorso(frame: PoseFrame): void {
    const shoulderL = this.v0;
    const shoulderR = this.v1;
    const hipL = this.v2;
    const hipR = this.v3;
    const vis = Math.min(
      this.landmarkFor(frame, L(LM.leftShoulder, LM.rightShoulder), "L", shoulderL),
      this.landmarkFor(frame, L(LM.leftShoulder, LM.rightShoulder), "R", shoulderR),
      this.landmarkFor(frame, L(LM.leftHip, LM.rightHip), "L", hipL),
      this.landmarkFor(frame, L(LM.leftHip, LM.rightHip), "R", hipR),
    );
    if (vis < this.minVisibility) return;

    const up = this.restDir.copy(shoulderL).add(shoulderR).multiplyScalar(0.5).sub(this.targetDir.copy(hipL).add(hipR).multiplyScalar(0.5));
    const left = this.targetDir.copy(shoulderL).sub(shoulderR);
    const upper = this.bones.get("upperBody");
    if (upper) this.applyWorldRotation(upper, this.quaternionFromLeftUp(left, up));

    const lower = this.bones.get("lowerBody");
    if (lower) {
      const hipLeft = this.targetDir.copy(hipL).sub(hipR);
      this.applyWorldRotation(lower, this.quaternionFromLeftUp(hipLeft, up));
    }
  }

  /** 頭: 両耳の線(左方向)と 耳中点→鼻(前方向) から基底を作る */
  private applyHead(frame: PoseFrame): void {
    const head = this.bones.get("head");
    if (!head) return;
    const earL = this.v0;
    const earR = this.v1;
    const nose = this.v2;
    const vis = Math.min(
      this.landmarkFor(frame, L(LM.leftEar, LM.rightEar), "L", earL),
      this.landmarkFor(frame, L(LM.leftEar, LM.rightEar), "R", earR),
      this.landmark(frame, LM.nose, nose),
    );
    if (vis < this.minVisibility) return;

    const left = this.restDir.copy(earL).sub(earR);
    const forward = this.targetDir.copy(nose).sub(this.v3.copy(earL).add(earR).multiplyScalar(0.5));
    this.applyWorldRotation(head, this.quaternionFromLeftForward(left, forward));
  }

  private applyDirection(frame: PoseFrame, rule: DirectionRule & { side: "L" | "R" }): void {
    const entry = this.bones.get(rule.bone);
    const child = this.bones.get(rule.child);
    if (!entry || !child) return;

    const from = this.v0;
    const to = this.v1;
    const vis = Math.min(
      this.landmarkFor(frame, rule.from, rule.side, from),
      this.landmarkFor(frame, rule.to, rule.side, to),
    );
    if (vis < this.minVisibility) return;

    this.restDir.copy(child.restPosition).sub(entry.restPosition);
    if (this.restDir.lengthSq() < 1e-8) return;
    this.restDir.normalize();
    this.targetDir.copy(to).sub(from);
    if (this.targetDir.lengthSq() < 1e-8) return;
    this.targetDir.normalize();

    // ローカル最小回転: q_local * restDir = inv(parentWorld) * targetDir
    // (親フレーム基準で回すことで、腕の捩れをレスト姿勢のまま保てる)
    this.parentWorldQuaternion(entry.bone, this.parentWorldQuat);
    this.targetDir.applyQuaternion(this.targetLocal.copy(this.parentWorldQuat).invert());
    this.targetLocal.setFromUnitVectors(this.restDir, this.targetDir);
    entry.bone.quaternion.slerp(this.targetLocal, this.smoothing);
  }

  // ---- 基底からの回転 ------------------------------------------------------

  private readonly tmpLeft = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();

  private quaternionFromLeftUp(left: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
    const l = this.tmpLeft.copy(left).normalize();
    const u = this.tmpUp.copy(up).normalize();
    // x × y = z なので forward = left × up
    const f = this.tmpForward.crossVectors(l, u).normalize();
    // left を up・forward に直交化し直す
    l.crossVectors(u, f).normalize();
    this.basis.makeBasis(l, u, f);
    return this.tmpQuat.setFromRotationMatrix(this.basis);
  }

  private quaternionFromLeftForward(left: THREE.Vector3, forward: THREE.Vector3): THREE.Quaternion {
    const l = this.tmpLeft.copy(left).normalize();
    const f = this.tmpForward.copy(forward).normalize();
    // up = forward × left
    const u = this.tmpUp.crossVectors(f, l).normalize();
    f.crossVectors(l, u).normalize();
    this.basis.makeBasis(l, u, f);
    return this.tmpQuat.setFromRotationMatrix(this.basis);
  }
}
