import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ThreeMmdLoader, disposeMmdModel } from "@yohawing/three-mmd-loader";
import type { ThreeMmdModel, MmdAnimation } from "@yohawing/three-mmd-loader";
import type { RefObject } from "react";
import { MmdPoseDriver } from "../pose/MmdPoseDriver";
import { LM } from "../pose/landmarks";
import type { PoseFrame } from "../pose/landmarks";
import type { VmdMotionRecorder } from "../pose/VmdMotionRecorder";
import type { Segment } from "../api/songs";
import { getMotionById } from "../motions";
import type { MotionDefinition } from "../motions";

const MODEL_URL = "/mmd/piloula-miku-expo10th.pmx";

// トラス(鉄格子)の実3Dモデル。ライセンスは public/stagemodel/README.md 参照。
const TRUSS_MODEL_URL = "/stagemodel/truss.glb";

// ステージ床のワールドY座標。Miku本体・足元の設置マーク・スピーカー列を
// すべてこの高さに揃えることで、宙に浮いて見えないようにする。
const STAGE_FLOOR_Y = 5;

interface StageSpotlightConfig {
  color: number;
  xFactor: number; // トラス幅に対する横位置(-0.5〜0.5)
  baseTiltDeg: number; // 常時の傾き(中央に向けて内向き)
  swayAmplitudeDeg: number;
  swayPeriodMs: number;
  swayPhase: number;
  coneOpacityScale: number;
}

// 添付の実ライブ写真のような、青系1種類のコーン形状・マテリアルだけを使い、
// 色味と配置だけを変えたスポットライト群(器具モデルは使わずビームのみ)。
const TOP_SPOTLIGHT_CONFIGS: StageSpotlightConfig[] = [
  { color: 0x5fd0ff, xFactor: -0.5, baseTiltDeg: 24, swayAmplitudeDeg: 4, swayPeriodMs: 6000, swayPhase: 0, coneOpacityScale: 1 },
  { color: 0x9fe6ff, xFactor: -0.28, baseTiltDeg: 12, swayAmplitudeDeg: 3, swayPeriodMs: 6800, swayPhase: 1.1, coneOpacityScale: 0.55 },
  { color: 0x9fe6ff, xFactor: 0.28, baseTiltDeg: -12, swayAmplitudeDeg: 3, swayPeriodMs: 6800, swayPhase: 2.2, coneOpacityScale: 0.55 },
  { color: 0x5fd0ff, xFactor: 0.5, baseTiltDeg: -24, swayAmplitudeDeg: 4, swayPeriodMs: 6000, swayPhase: 3.3, coneOpacityScale: 1 },
];

// Miku自身へ向けて内向きに収束するキーライト(トラスから彼女の正面へ)。
const MIKU_SPOTLIGHT_CONFIGS: StageSpotlightConfig[] = [
  { color: 0xffcf7a, xFactor: -0.13, baseTiltDeg: 9, swayAmplitudeDeg: 2, swayPeriodMs: 7200, swayPhase: 0.4, coneOpacityScale: 1.6 },
  { color: 0xffcf7a, xFactor: 0.13, baseTiltDeg: -9, swayAmplitudeDeg: 2, swayPeriodMs: 7200, swayPhase: 2.6, coneOpacityScale: 1.6 },
];

const AUDIENCE_SPOTLIGHT_CONFIGS: StageSpotlightConfig[] = [
  { color: 0xf3fbff, xFactor: -0.4, baseTiltDeg: -22, swayAmplitudeDeg: 5, swayPeriodMs: 5200, swayPhase: 0, coneOpacityScale: 1.6 },
  { color: 0xf3fbff, xFactor: 0.4, baseTiltDeg: 22, swayAmplitudeDeg: 5, swayPeriodMs: 5200, swayPhase: 2.7, coneOpacityScale: 1.6 },
];

interface StageSpotlight {
  swayGroup: THREE.Group;
  baseTiltRad: number;
  swayAmplitudeRad: number;
  swayPeriodMs: number;
  swayPhase: number;
}

function updateStageSpotlights(spotlights: StageSpotlight[], timeMs: number): void {
  for (const s of spotlights) {
    const sway = Math.sin((timeMs / s.swayPeriodMs) * Math.PI * 2 + s.swayPhase) * s.swayAmplitudeRad;
    s.swayGroup.rotation.z = s.baseTiltRad + sway;
  }
}

// サビ到達時の演出照明の「点灯」を、ぱっと表示するのではなく明るさが
// 0→本来値へゆっくり上がるフェードにする(急に光り出すのが不自然という
// フィードバック対応)。このグループのマテリアルは全てこちらで用意した
// MeshBasicMaterial/MeshStandardMaterialなので、opacityでのフェードが安全に効く。
function beginGroupFadeIn(root: THREE.Object3D): void {
  root.visible = true;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (mat.userData.fadeBaseOpacity === undefined) {
        mat.userData.fadeBaseOpacity = mat.opacity;
      }
      mat.transparent = true;
      mat.opacity = 0;
    }
  });
}

function applyGroupFadeIn(root: THREE.Object3D, t: number): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      const base = (mat.userData.fadeBaseOpacity as number | undefined) ?? 1;
      mat.opacity = base * t;
    }
  });
}

// 指定した原点・角度からビームの列を1グループ生成する(全グループ共通の
// ジオメトリ・テクスチャを共有し、形状・質感自体は統一する)。
function addSpotlightBeams(
  parent: THREE.Object3D,
  stageSpotlights: StageSpotlight[],
  configs: StageSpotlightConfig[],
  coneGeometry: THREE.ConeGeometry,
  lightShaftTexture: THREE.Texture,
  trussWidth: number,
  originY: number,
  originZ: number,
  forwardTiltRad: number,
  opacityBase: number,
  widthScale = 0.3,
): void {
  for (const config of configs) {
    const xPos = config.xFactor * trussWidth;
    const swayGroup = new THREE.Group();
    swayGroup.position.set(xPos, originY, originZ);
    swayGroup.rotation.x = -forwardTiltRad;
    parent.add(swayGroup);

    // 以前は薄く広いhalo(周辺の淡い光の層)+core(芯)の2層構造だったが、
    // haloが画面全体を淡く霞ませてしまうため廃止し、明るいcoreのみ残した。
    // 単色の三角形のままだと平面的なので、alphaMapで光源側を明るく・先端を
    // 減衰させるグラデーション+ノイズ状の縦筋を与えて空間的な厚みを出す。
    const core = new THREE.Mesh(
      coneGeometry,
      new THREE.MeshBasicMaterial({
        color: config.color,
        alphaMap: lightShaftTexture,
        transparent: true,
        opacity: opacityBase * config.coneOpacityScale,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    core.scale.set(widthScale, 1, widthScale);
    swayGroup.add(core);

    stageSpotlights.push({
      swayGroup,
      baseTiltRad: (config.baseTiltDeg * Math.PI) / 180,
      swayAmplitudeRad: (config.swayAmplitudeDeg * Math.PI) / 180,
      swayPeriodMs: config.swayPeriodMs,
      swayPhase: config.swayPhase,
    });
  }
}

// スピーカー1台(暗い箱+同心リングのウーファー2基)。実モデルを使わず組む—
// 形状・マテリアルは全台共通で、配置だけをクラスタごとに変える。
function buildSpeakerUnit(size: number, ringMaterials: THREE.MeshBasicMaterial[]): THREE.Group {
  const group = new THREE.Group();
  // 横向き(幅>高さ)の箱。ウーファー2基も縦積みではなく横に並べる。
  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(size * 1.3, size, size * 0.85),
    new THREE.MeshStandardMaterial({ color: 0x0d0d12, roughness: 0.8, metalness: 0.1 }),
  );
  // グループ原点(y=0)が箱の上辺になるよう、下向きに配置する
  // (Mikuの一番下=足元にスピーカーの上辺を合わせるため)。
  cabinet.position.y = size * -0.5;
  group.add(cabinet);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x4fd8ff,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  ringMaterials.push(ringMaterial);
  for (const x of [-size * 0.34, size * 0.34]) {
    for (const r of [size * 0.3, size * 0.19]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.75, r, 24), ringMaterial);
      ring.position.set(x, size * -0.5, size * 0.43);
      group.add(ring);
    }
  }
  return group;
}

// Mikuの足場代わりのスピーカー列。地面は無くし、彼女の足元を取り囲むように
// トラス幅(=画面幅)に収まる台数を自動計算して並べる(添付写真の構図を踏襲)。
// 戻り値のringMaterialsは、最初のサビ以降に呼び出し側が明滅アニメーションを
// 掛けるために使う(常時表示はそのまま、輝き方だけサビでなめらかに変える)。
function buildSpeakerWall(
  parent: THREE.Object3D,
  trussWidth: number,
  modelHeight: number,
  ringMaterials: THREE.MeshBasicMaterial[],
): void {
  const unitSize = modelHeight * 0.34;
  const unitWidth = unitSize * 1.3; // 横向き箱の幅
  const speakerZ = -modelHeight * 0.05;

  // 隙間なく密着させ、画面幅(の92%)に収まる最大台数を求める。
  const availableWidth = trussWidth * 0.92;
  const count = Math.max(3, Math.min(9, Math.floor(availableWidth / unitWidth)));
  const spacing = unitWidth;

  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * spacing;
    const unit = buildSpeakerUnit(unitSize, ringMaterials);
    unit.position.set(x, STAGE_FLOOR_Y, speakerZ);
    parent.add(unit);
  }
}

// スポットライトのビーム用テクスチャ。単色の三角形だと平面的に見えるため、
// 光源側(V=1)を明るく先端(V=0)にかけて減衰するグラデーションに、空気中の
// 塵に光が散乱しているようなムラ(縦筋)を重ね、光そのものに空間的な厚みを
// 持たせる。全灯で1枚を共有する(見た目を統一するため)。
function createLightShaftTexture(): THREE.Texture {
  const width = 64;
  const height = 128;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  const gradient = ctx.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, "rgba(255,255,255,0.3)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.75)");
  gradient.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 等間隔だと人工的に見えるため、筋の幅・濃さを乱数で変えたマスクを別
  // キャンバスに作り、1回のdestination-inでまとめて重ねる(このcanvas上で
  // destination-inを逐次呼ぶと、直前の呼び出しでキャンバス全体がその矩形の
  // 外側まで透明化されてしまい、それまでの筋が消えてしまうため)。
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d");
  if (maskCtx) {
    let x = 0;
    while (x < width) {
      const streakWidth = 2 + Math.random() * 5;
      const alpha = 0.6 + Math.random() * 0.4;
      maskCtx.fillStyle = `rgba(255,255,255,${alpha})`;
      maskCtx.fillRect(x, 0, streakWidth, height);
      x += streakWidth;
    }
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

// トラス(鉄格子)を画面幅いっぱいに配置し、そこから客席へ向けて統一デザインの
// スポットライトを扇状に降らせ、地面の代わりにスピーカーの壁を並べる。
export interface StageRevealGroups {
  // Miku自身へ向けたキーライト(と足元の設置マーク)。曲再生開始と同時に表示する。
  mikuLightsGroup: THREE.Group;
  // それ以外の演出照明(扇状ビーム・客席向けライト)。
  // 最初のサビに入ったタイミングで表示し、以降は表示したままにする。
  revealGroup: THREE.Group;
  // スピーカーのリング。常時表示のまま、最初のサビ以降は明滅アニメーションを付ける。
  speakerRingMaterials: THREE.MeshBasicMaterial[];
}

async function attachStageDecor(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  modelHeight: number,
  stageSpotlights: StageSpotlight[],
  isDisposed: () => boolean,
): Promise<StageRevealGroups> {
  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  // カメラ位置からZ=0平面までの距離をもとに、その高さで画面に収まる横幅を算出。
  // 0.96は画面端でのクリッピングを避けるための余白。
  const distanceToStage = camera.position.z;
  const vFovRad = (camera.fov * Math.PI) / 180;
  const visibleWidthAtStage = 2 * Math.tan(vFovRad / 2) * distanceToStage * camera.aspect;
  const trussWidth = visibleWidthAtStage * 0.96;
  const trussY = modelHeight * 1.5;

  // 演出の段階公開用グループ。曲再生開始/最初のサビ到達のタイミングで
  // 呼び出し側がvisibleを切り替える(初期状態は両方非表示)。
  const mikuLightsGroup = new THREE.Group();
  mikuLightsGroup.visible = false;
  scene.add(mikuLightsGroup);
  const revealGroup = new THREE.Group();
  revealGroup.visible = false;
  scene.add(revealGroup);
  const speakerRingMaterials: THREE.MeshBasicMaterial[] = [];
  const groups: StageRevealGroups = { mikuLightsGroup, revealGroup, speakerRingMaterials };

  // Mikuが立つ床の位置を示す色付きの輪(浮いて見えないようにする設置マーク)。
  // Miku本体と同じmikuLightsGroupに入れ、同じタイミングでフェードインさせる。
  const groundRingGeometry = new THREE.RingGeometry(modelHeight * 0.22, modelHeight * 0.27, 48);
  groundRingGeometry.rotateX(-Math.PI / 2);
  const groundRing = new THREE.Mesh(
    groundRingGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x8fe0ff,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  groundRing.position.set(0, STAGE_FLOOR_Y + 0.05, 0);
  mikuLightsGroup.add(groundRing);

  const trussGltf = await gltfLoader.loadAsync(TRUSS_MODEL_URL);
  if (isDisposed()) return groups;

  const trussScene = trussGltf.scene;
  const localSize = new THREE.Box3().setFromObject(trussScene).getSize(new THREE.Vector3());
  const scale = localSize.x > 0 ? trussWidth / localSize.x : 1;
  trussScene.scale.setScalar(scale);
  const scaledCenter = new THREE.Box3().setFromObject(trussScene).getCenter(new THREE.Vector3());
  trussScene.position.x -= scaledCenter.x;
  trussScene.position.z -= scaledCenter.z;
  trussScene.position.y += trussY - scaledCenter.y;
  scene.add(trussScene);

  // --- スポットライト。ビーム形状・マテリアル(コーン+光源テクスチャ)は
  // 全グループ共通=1種類。原点の高さ・向き・角度だけをグループごとに変えて、
  // (1)全体の雰囲気を作る扇状のビーム (2)Mikuへ向けて収束するキーライト
  // (3)客席(カメラ)側へ低い位置からほぼ水平に放つライト、の3種を作る。
  const coneHeight = modelHeight * 1.6;
  const coneRadius = coneHeight * Math.tan((Math.PI * 18) / 180);
  const coneGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, 24, 1, true);
  coneGeometry.translate(0, -coneHeight / 2, 0);
  const lightShaftTexture = createLightShaftTexture();

  addSpotlightBeams(
    revealGroup,
    stageSpotlights,
    TOP_SPOTLIGHT_CONFIGS,
    coneGeometry,
    lightShaftTexture,
    trussWidth,
    trussY,
    modelHeight * 0.2,
    (27 * Math.PI) / 180,
    0.05,
  );
  addSpotlightBeams(
    mikuLightsGroup,
    stageSpotlights,
    MIKU_SPOTLIGHT_CONFIGS,
    coneGeometry,
    lightShaftTexture,
    trussWidth,
    trussY,
    modelHeight * 0.15,
    (45 * Math.PI) / 180,
    0.06,
  );
  addSpotlightBeams(
    revealGroup,
    stageSpotlights,
    AUDIENCE_SPOTLIGHT_CONFIGS,
    coneGeometry,
    lightShaftTexture,
    trussWidth,
    modelHeight * 0.4,
    modelHeight * 0.1,
    (46 * Math.PI) / 180,
    0.05,
    0.5,
  );

  // スピーカーの発光部分は「ずっと光っていていい」とのフィードバックなので、
  // 段階公開のrevealGroupには入れずscene直下に置き最初から常時表示する。
  // スピーカーの発光部分は、他の演出照明と同じく最初のサビでフェードインさせる
  // (それまでは非表示)。
  buildSpeakerWall(revealGroup, trussWidth, modelHeight, speakerRingMaterials);

  return groups;
}

type MotionKey = "verse" | "chorus";
export type MotionSource = Pick<MotionDefinition, "url" | "referenceBpm">;

// プールにモーションを増やすときはmotions.tsに登録した上でここにid追加
const MOTION_POOL_IDS: Record<MotionKey, string[]> = {
  verse: ["helltaker-verse","pose-capture-test"],
  chorus: ["ingrid"],
};

function resolveMotionPool(key: MotionKey): MotionDefinition[] {
  const pool = MOTION_POOL_IDS[key].map((id) => {
    const motion = getMotionById(id);
    if (!motion) throw new Error(`Unknown motion id for "${key}": ${id}`);
    return motion;
  });
  if (pool.length === 0) throw new Error(`Motion pool for "${key}" is empty`);
  return pool;
}

const MOTION_POOLS: Record<MotionKey, MotionDefinition[]> = {
  verse: resolveMotionPool("verse"),
  chorus: resolveMotionPool("chorus"),
};
const MMD_FPS = 30;

const MIN_PLAYBACK_RATE = 0.5;
const MAX_PLAYBACK_RATE = 2;

function computePlaybackRate(bpm: number | null | undefined, referenceBpm: number): number {
  if (!bpm || bpm <= 0) return 1;
  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, bpm / referenceBpm));
}

type Status = "loading" | "ready" | "error";

function getAnimationDurationSec(animation: MmdAnimation): number {
  let maxFrame = 0;
  for (const track of Object.values(animation.boneTracks)) {
    const frames = track.frames;
    if (frames.length > 0) maxFrame = Math.max(maxFrame, frames[frames.length - 1]);
  }
  for (const track of Object.values(animation.morphTracks)) {
    const frames = track.frames;
    if (frames.length > 0) maxFrame = Math.max(maxFrame, frames[frames.length - 1]);
  }
  return maxFrame / MMD_FPS;
}

export interface MikuModel3DProps {
  /**
   * 姿勢推定の最新フレーム。値が入っている間はランドマークでボーンを駆動し、
   * null の間はダンス再生(未再生時は静止ポーズ+ゆっくりした揺れ)に戻る。
   */
  poseFrameRef?: RefObject<PoseFrame | null>;
  /**
   * 姿勢推定の正規化画像ランドマーク(0..1 の画像座標)。渡すと、カメラに写っている
   * 立ち位置(腰の中点の x)に合わせてモデルをステージ上で左右に移動させる。
   */
  poseImageFrameRef?: RefObject<PoseFrame | null>;
  /** 鏡写しにするか(デフォルト true) */
  mirror?: boolean;
  /** 渡すと、姿勢駆動中の毎フレームをこのレコーダーへ記録する(録画中のみ) */
  vmdRecorder?: VmdMotionRecorder;
  bpm?: number | null;
  onPlay?: () => void;
  // 「ライブ停止」ボタンが押されたときに呼ばれる(曲側の停止処理はこのコール
  // バック内で呼び出し側が行う)。
  onStop?: () => void;
  // 曲の実再生位置[ms]を返す関数
  getPositionMs?: () => number;
  startAtMs?: number;
  segments?: Segment[];
  motionOverride?: MotionSource;
  // 曲側(SongPlayer)がrequestPlay()を呼んでも安全な状態になっているか。
  // 未指定ならtrue扱い(曲データなしのプレビュー用フォールバック)。
  readyToPlay?: boolean;
  // トラス・スポットライト・スピーカー等のステージ演出を表示するか(既定true)。
  // モーション単体テスト・録画画面など、Miku単体だけ見たい場合にfalseにする。
  showStageDecor?: boolean;
}

export function MikuModel3D({
  poseFrameRef,
  poseImageFrameRef,
  mirror = true,
  vmdRecorder,
  bpm,
  onPlay,
  onStop,
  getPositionMs,
  startAtMs,
  segments,
  motionOverride,
  readyToPlay = true,
  showStageDecor = true,
}: MikuModel3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [motionReady, setMotionReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // The render loop below lives inside a mount-once effect and reads these
  // every frame — refs (not state) so a button click (or a prop change)
  // can steer it without tearing down and rebuilding the whole WebGL scene.
  const poseFrameRefRef = useRef(poseFrameRef);
  poseFrameRefRef.current = poseFrameRef;
  const poseImageFrameRefRef = useRef(poseImageFrameRef);
  poseImageFrameRefRef.current = poseImageFrameRef;
  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;
  const vmdRecorderRef = useRef(vmdRecorder);
  vmdRecorderRef.current = vmdRecorder;
  const isPlayingRef = useRef(false);
  const playStartTimeRef = useRef(0);
  const bpmRef = useRef(bpm);
  const getPositionMsRef = useRef(getPositionMs);
  const startAtMsRef = useRef(startAtMs ?? 0);
  const segmentsRef = useRef(segments);
  const motionOverrideRef = useRef(motionOverride);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  useEffect(() => {
    getPositionMsRef.current = getPositionMs;
  }, [getPositionMs]);
  useEffect(() => {
    startAtMsRef.current = startAtMs ?? 0;
  }, [startAtMs]);
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);
  useEffect(() => {
    motionOverrideRef.current = motionOverride;
  }, [motionOverride]);

  const handlePlay = () => {
    playStartTimeRef.current = performance.now();
    isPlayingRef.current = true;
    setIsPlaying(true);
    onPlay?.();
  };

  const handleStop = () => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    onStop?.();
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let model: ThreeMmdModel | null = null;
    // モーションIDごとに読み込み済みのアニメーションをキャッシュ
    // プール間で同じIDが重複しても1回しか読み込まない
    const loadedMotions = new Map<string, { animation: MmdAnimation; durationSec: number }>();
    let poseDriver: MmdPoseDriver | null = null;
    let wasPoseDriven = false;
    let activeMotionKey: MotionKey = "verse";
    let activeMotionId: string | null = null;
    let activeSegmentStartMs = 0;
    const occurrenceCount: Record<MotionKey, number> = { verse: 0, chorus: 0 };
    const stageSpotlights: StageSpotlight[] = [];
    // ライブ開始前はMiku非表示。開始と同時にMikuを照らすキーライトを点灯し、
    // 最初のサビに入ったら残りの演出照明・スピーカーを常時表示に切り替える
    // (一度表示したら曲が終わるまで戻さない一方通行の演出)。
    let mikuLightsGroup: THREE.Group | null = null;
    let revealGroup: THREE.Group | null = null;
    let speakerRingMaterials: THREE.MeshBasicMaterial[] = [];
    let mikuFadeStartMs: number | null = null;
    let revealFadeStartMs: number | null = null;
    const MIKU_FADE_DURATION_MS = 1200;
    const REVEAL_FADE_DURATION_MS = 1500;
    // スピーカーのリングは常時表示のまま、最初のサビ以降だけゆっくり明滅させる
    // (それまでは元のopacityで静止表示)。
    const SPEAKER_PULSE_PERIOD_MS = 2600;
    const scene = new THREE.Scene();
    // far=200: ステージ実モデルが奥行きのある室内シーンのため、100だと部屋の
    // 奥壁がクリップされてしまう。
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(renderer.domElement);

    // MMD PVでよく使われる発光(ブルーム)エフェクト。加算合成のビーム・色電球・
    // Mikuの明るい部分がふわっと滲むことで、実際のライブのような空気感を出す。
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // thresholdを高くし、Miku自身の衣装(白っぽいトゥーンシェード)は素通りさせて、
    // 加算合成のビームの芯・色電球など「ほぼ飽和した」画素だけがふわっと滲むようにする
    // (0.78以下だとMiku本体の白い衣装ごとブルームして真っ白に潰れた)。
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.35, 0.96);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    // 実際のライブのような暗さ・コントラストを出すため全体を暗めに(以前は
    // 0.75/1.6/0.6でフラットに明るすぎた)。スポットライトのビーム(加算合成の
    // 自己発光メッシュ)はこれらの影響を受けないので、暗い舞台に光の筋だけが
    // 浮かぶ見た目になる。
    scene.add(new THREE.AmbientLight(0xffffff, 0.07));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.26);
    keyLight.position.set(1, 2.4, 1.6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x8fdfff, 0.1);
    rimLight.position.set(-1.5, 1.2, -1.5);
    scene.add(rimLight);

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight);
      composer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.error("WebGL context lost while rendering MMD model");
      renderer.setAnimationLoop(null);
      if (!disposed) setStatus("error");
    };
    const handleContextRestored = () => {
      console.warn("WebGL context restored; reload the page to reinitialize the model");
    };
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored);

    const loader = new ThreeMmdLoader();

    loader
      .loadModel(MODEL_URL, { outline: false, materialRenderOrder: false })
      .then((loaded) => {
        if (disposed) {
          disposeMmdModel(loaded);
          return;
        }
        model = loaded;

        const box = new THREE.Box3().setFromObject(model.root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.root.position.x -= center.x;
        model.root.position.z -= center.z;
        model.root.position.y += STAGE_FLOOR_Y;

        // ライブ開始前はMiku本体を隠しておく(演出開始と同時に表示する)。
        model.root.visible = false;
        scene.add(model.root);

        // 1.35→1.9: トラス・スポットライトを画面内に収めるための余白を確保。
        // attachStageDecorはこのカメラ位置(特にposition.z/aspect)を使って
        // 画面幅ぴったりのトラス幅を逆算するので、先に確定させておく。
        const distance = ((size.y / 2) / Math.tan((camera.fov * Math.PI) / 360)) * 1.9;
        camera.position.set(0, size.y * 0.58, distance);
        camera.lookAt(0, size.y * 0.58, 0);

        if (showStageDecor) {
          attachStageDecor(scene, camera, size.y, stageSpotlights, () => disposed)
            .then((groups) => {
              mikuLightsGroup = groups.mikuLightsGroup;
              revealGroup = groups.revealGroup;
              speakerRingMaterials = groups.speakerRingMaterials;
            })
            .catch((err: unknown) => {
              console.error("Failed to load stage decor", err);
            });
        }

        // カメラ内の立ち位置追従: ルートを baseX からの横オフセットで動かす
        const baseX = model.root.position.x;
        let positionOffsetX = 0;

        model.update(0);
        // Bones are driven directly (bypassing the loader runtime) while pose
        // tracking is active. Must be created after update(0) so reset() restores
        // the runtime's initial pose.
        poseDriver = new MmdPoseDriver(model.mesh, { mirror: mirrorRef.current });
        if (poseDriver.missingBones.length > 0) {
          console.warn("MmdPoseDriver: bones not found in model", poseDriver.missingBones);
        }
        setStatus("ready");
        const computeDanceElapsedSec = (timeMs: number): number | null => {
          const getPosition = getPositionMsRef.current;
          if (!getPosition) {
            const source = motionOverrideRef.current ?? MOTION_POOLS.verse[0];
            const motion = loadedMotions.get(source.url);
            if (!motion) return null;
            const rate = computePlaybackRate(bpmRef.current, source.referenceBpm);
            const elapsedSec = ((timeMs - playStartTimeRef.current) / 1000) * rate;
            return elapsedSec % motion.durationSec;
          }

          const positionMs = getPosition();
          if (positionMs - startAtMsRef.current < 0) return null;

          let desiredKey: MotionKey = "verse";
          let segmentStartMs = startAtMsRef.current;
          const currentSegment = segmentsRef.current?.find(
            (seg) => positionMs >= seg.startsAtMs && positionMs < seg.endsAtMs,
          );
          if (currentSegment) {
            desiredKey = currentSegment.isChorus ? "chorus" : "verse";
            segmentStartMs = currentSegment.startsAtMs;
          }

          // 新しい区間に入るたび、そのプールの次のモーションをローテーションで選ぶ
          if (!activeMotionId || segmentStartMs !== activeSegmentStartMs || desiredKey !== activeMotionKey) {
            const pool = MOTION_POOLS[desiredKey];
            const picked = pool[occurrenceCount[desiredKey] % pool.length];
            const nextMotion = loadedMotions.get(picked.url);
            if (model && nextMotion) {
              model.setAnimation(nextMotion.animation);
              activeMotionKey = desiredKey;
              activeMotionId = picked.url;
              activeSegmentStartMs = segmentStartMs;
              occurrenceCount[desiredKey] += 1;
            }
          }

          if (!activeMotionId) return null;
          const activeSource = MOTION_POOLS[activeMotionKey].find((m) => m.url === activeMotionId);
          const motion = loadedMotions.get(activeMotionId);
          if (!motion || !activeSource) return null;
          const rate = computePlaybackRate(bpmRef.current, activeSource.referenceBpm);
          const elapsedSec = ((positionMs - activeSegmentStartMs) / 1000) * rate;
          return elapsedSec % motion.durationSec;
        };

        const targetFrameIntervalMs = 1000 / 24;
        let lastFrameTime = 0;
        renderer.setAnimationLoop((timeMs: number) => {
          if (timeMs - lastFrameTime < targetFrameIntervalMs) return;
          lastFrameTime = timeMs;
          if (model) {
            const frame = poseFrameRefRef.current?.current ?? null;
            if (frame && poseDriver) {
              poseDriver.setMirror(mirrorRef.current);
              poseDriver.apply(frame);

              // 画像内の腰の位置 → ステージ上の横位置。
              // 見えないフレームでは前回位置を保持し、スムージングで飛びを抑える。
              const imageFrame = poseImageFrameRefRef.current?.current ?? null;
              let targetOffsetX = positionOffsetX;
              if (imageFrame) {
                const hipL = imageFrame[LM.leftHip];
                const hipR = imageFrame[LM.rightHip];
                if (hipL && hipR && Math.min(hipL.visibility, hipR.visibility) >= 0.5) {
                  const hipX = (hipL.x + hipR.x) / 2; // 0(画像左端)..1(右端)
                  // 鏡表示ではプレビューと同じ向きに動かす(画像 x を反転)
                  const norm = mirrorRef.current ? 0.5 - hipX : hipX - 0.5; // -0.5..0.5、+が画面右
                  // モデル位置(z=0 平面)でのカメラの可視半幅。少し内側に収める。
                  const halfRange = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect * distance * 0.85;
                  targetOffsetX = THREE.MathUtils.clamp(norm * 2 * halfRange, -halfRange, halfRange);
                }
              }
              positionOffsetX += (targetOffsetX - positionOffsetX) * 0.3;
              model.root.position.x = baseX + positionOffsetX;

              vmdRecorderRef.current?.capture(poseDriver, timeMs, positionOffsetX);
              // face the audience while mimicking; ease the sway out
              model.root.rotation.y *= 0.8;
              wasPoseDriven = true;
            } else {
              if (wasPoseDriven && poseDriver) {
                poseDriver.reset();
                wasPoseDriven = false;
              }
              // トラッキング終了後は中央へ滑らかに戻す
              positionOffsetX *= 0.85;
              model.root.position.x = baseX + positionOffsetX;
              const danceElapsedSec = isPlayingRef.current ? computeDanceElapsedSec(timeMs) : null;
              if (danceElapsedSec !== null) {
                model.update(danceElapsedSec);
              } else {
                model.root.rotation.y = Math.sin(timeMs * 0.00015) * 0.35;
              }
            }
          }
          // Miku本体とMiku用ライトは、急に現れるのではなく明るさ0から
          // ゆっくりフェードインさせる(曲停止で再度隠すことはしない一方通行)。
          // mikuLightsGroupがattachStageDecorの非同期読み込み待ちで遅れて
          // 現れた場合も、その時点のフェード進捗から続きを再生する。
          if (isPlayingRef.current && mikuFadeStartMs === null) {
            mikuFadeStartMs = timeMs;
          }
          if (mikuFadeStartMs !== null) {
            const t = Math.min(1, (timeMs - mikuFadeStartMs) / MIKU_FADE_DURATION_MS);
            if (model) {
              if (!model.root.visible) beginGroupFadeIn(model.root);
              applyGroupFadeIn(model.root, t);
            }
            if (mikuLightsGroup) {
              if (!mikuLightsGroup.visible) beginGroupFadeIn(mikuLightsGroup);
              applyGroupFadeIn(mikuLightsGroup, t);
            }
          }
          if (revealFadeStartMs === null && isPlayingRef.current) {
            const getPosition = getPositionMsRef.current;
            const firstChorus = segmentsRef.current?.find((seg) => seg.isChorus);
            // 実曲データが無いプレビュー等では判定できないので、再生開始と同時に見せる。
            const reached = !getPosition || !firstChorus || getPosition() >= firstChorus.startsAtMs;
            if (reached && revealGroup) {
              revealFadeStartMs = timeMs;
              beginGroupFadeIn(revealGroup);
            }
          }
          if (revealFadeStartMs !== null && revealGroup) {
            const t = Math.min(1, (timeMs - revealFadeStartMs) / REVEAL_FADE_DURATION_MS);
            applyGroupFadeIn(revealGroup, t);
            // スピーカーのリングだけは、フェードインに加えてなめらかな明滅も
            // 重ねる(他の演出照明と同じくサビまでは非表示 → サビでフェード
            // インしつつ、そのまま明るさが周期的に揺れ続ける)。
            const phase = ((timeMs - revealFadeStartMs) / SPEAKER_PULSE_PERIOD_MS) * Math.PI * 2;
            const pulse = 0.7 + 0.3 * Math.sin(phase);
            for (const mat of speakerRingMaterials) {
              const fadeBase = (mat.userData.fadeBaseOpacity as number | undefined) ?? mat.opacity;
              mat.opacity = fadeBase * t * pulse;
            }
          }
          updateStageSpotlights(stageSpotlights, timeMs);
          composer.render();
        });
        const primarySource = motionOverrideRef.current ?? MOTION_POOLS.verse[0];

        loader
          .loadAnimation(primarySource.url)
          .then(({ animation }) => {
            if (disposed || !model) return;
            loadedMotions.set(primarySource.url, {
              animation,
              durationSec: getAnimationDurationSec(animation),
            });
            model.setAnimation(animation);
            setMotionReady(true);
          })
          .catch((err: unknown) => {
            console.error(`Failed to load MMD motion: ${primarySource.url}`, err);
          });

        if (!motionOverrideRef.current) {
          const remainingUrls = new Set<string>();
          for (const pool of Object.values(MOTION_POOLS)) {
            for (const motion of pool) remainingUrls.add(motion.url);
          }
          remainingUrls.delete(primarySource.url);

          for (const url of remainingUrls) {
            loader
              .loadAnimation(url)
              .then(({ animation }) => {
                if (disposed) return;
                loadedMotions.set(url, { animation, durationSec: getAnimationDurationSec(animation) });
              })
              .catch((err: unknown) => {
                console.error(`Failed to load MMD motion: ${url}`, err);
              });
          }
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to load MMD model", err);
        if (!disposed) setStatus("error");
      });

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
      renderer.setAnimationLoop(null);
      if (model) disposeMmdModel(model);
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="viewer-miku">
      <div className="viewer-miku__pool" aria-hidden="true" />
      <div ref={containerRef} className="viewer-miku__canvas" aria-hidden="true" />
      {status === "loading" && (
        <span className="viewer-miku__caption">初音ミク 読み込み中…</span>
      )}
      {status === "error" && (
        <span className="viewer-miku__caption">
          表示に失敗しました(ページの再読み込みをお試しください)
        </span>
      )}
      {status === "ready" && motionReady && readyToPlay && !isPlaying && (
        <button type="button" className="viewer-miku__play-button" onClick={handlePlay}>
          ▶ ライブ開始
        </button>
      )}
      {status === "ready" && isPlaying && (
        <button
          type="button"
          className="viewer-miku__play-button viewer-miku__play-button--stop"
          onClick={handleStop}
        >
          ■ ライブ停止
        </button>
      )}
    </div>
  );
}
