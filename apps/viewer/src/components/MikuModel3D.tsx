import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
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

type MotionKey = "verse" | "chorus";
export type MotionSource = Pick<MotionDefinition, "url" | "referenceBpm">;

// どのモーションIDをverse/chorusに割り当てるかだけを決める
// サビ区間(isChorus)に入ったらchorus側に切り替え
const MOTION_IDS: Record<MotionKey, string> = {
  verse: "helltaker-verse",
  chorus: "helltaker-chorus",
};

function resolveMotionSource(key: MotionKey): MotionSource {
  const motion = getMotionById(MOTION_IDS[key]);
  if (!motion) {
    throw new Error(`Unknown motion id for "${key}": ${MOTION_IDS[key]}`);
  }
  return motion;
}

const MOTION_SOURCES: Record<MotionKey, MotionSource> = {
  verse: resolveMotionSource("verse"),
  chorus: resolveMotionSource("chorus"),
};
const MMD_FPS = 30;

const MIN_PLAYBACK_RATE = 0.5;
const MAX_PLAYBACK_RATE = 2;

function computePlaybackRate(bpm: number | null | undefined, referenceBpm: number): number {
  if (!bpm || bpm <= 0) return 1;
  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, bpm / referenceBpm));
}

type Status = "loading" | "ready" | "error";

// VMD tracks don't carry an explicit "duration" — it's the last keyframe
// across every bone/morph track, in MMD's fixed 30fps frame numbering.
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
  // 曲の実再生位置[ms]を返す関数
  getPositionMs?: () => number;
  startAtMs?: number;
  segments?: Segment[];
  motionOverride?: MotionSource;
}

export function MikuModel3D({
  poseFrameRef,
  poseImageFrameRef,
  mirror = true,
  vmdRecorder,
  bpm,
  onPlay,
  getPositionMs,
  startAtMs,
  segments,
  motionOverride,
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let model: ThreeMmdModel | null = null;
    let poseDriver: MmdPoseDriver | null = null;
    let wasPoseDriven = false;
    const motions: Record<MotionKey, { animation: MmdAnimation; durationSec: number } | null> = {
      verse: null,
      chorus: null,
    };
    let activeMotionKey: MotionKey = "verse";
    let activeSegmentStartMs = 0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 100);
    // antialias off + capped pixel ratio: this canvas is small (a few hundred px),
    // and MSAA + high DPR was pushing sustained per-frame GPU cost high enough to
    // trigger context loss ("watchdog kills a too-slow context") on weaker/software GPUs.
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(1, 2.4, 1.6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x8fdfff, 0.6);
    rimLight.position.set(-1.5, 1.2, -1.5);
    scene.add(rimLight);

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight);
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
        model.root.position.y -= box.min.y;

        scene.add(model.root);

        const distance = ((size.y / 2) / Math.tan((camera.fov * Math.PI) / 360)) * 1.35;
        camera.position.set(0, size.y * 0.52, distance);
        camera.lookAt(0, size.y * 0.5, 0);

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

        // Until "再生" is pressed, she just sways gently in place. Pressing
        // the button arms playback; the dance itself only starts once the
        // song's real position reaches its first beat (returns null until then).
        // While playing, each frame also checks which song segment we're in
        // and swaps to the chorus/verse motion accordingly.
        const computeDanceElapsedSec = (timeMs: number): number | null => {
          const getPosition = getPositionMsRef.current;
          if (!getPosition) {
            // No real playback clock (preview without a fetched song, or
            // single-motion test mode) — fall back to the local-clock,
            // verse-slot-only behavior. In test mode, motions.verse holds
            // the override motion and its own referenceBpm applies.
            const motion = motions.verse;
            if (!motion) return null;
            const referenceBpm = motionOverrideRef.current?.referenceBpm ?? MOTION_SOURCES.verse.referenceBpm;
            const rate = computePlaybackRate(bpmRef.current, referenceBpm);
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

          if (desiredKey !== activeMotionKey) {
            const nextMotion = motions[desiredKey];
            if (model && nextMotion) {
              model.setAnimation(nextMotion.animation);
              activeMotionKey = desiredKey;
              activeSegmentStartMs = segmentStartMs;
            }
          } else if (segmentStartMs !== activeSegmentStartMs) {
            activeSegmentStartMs = segmentStartMs;
          }

          const motion = motions[activeMotionKey];
          if (!motion) return null;
          const rate = computePlaybackRate(bpmRef.current, MOTION_SOURCES[activeMotionKey].referenceBpm);
          const elapsedSec = ((positionMs - activeSegmentStartMs) / 1000) * rate;
          return elapsedSec % motion.durationSec;
        };

        // Capping the loop well below display refresh rate keeps sustained GPU
        // load low, which is what avoids the context-loss crash on weaker/software
        // GPUs. Pose tracking is applied at the same capped rate (the webcam is
        // ~30fps anyway). While a pose frame is available the landmarks drive the
        // bones directly (model.update() must not run then — the runtime would
        // overwrite them with the VMD evaluation); otherwise dance playback (or
        // the idle sway) takes over.
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
          renderer.render(scene, camera);
        });

        loader
          .loadAnimation(motionOverrideRef.current?.url ?? MOTION_SOURCES.verse.url)
          .then(({ animation }) => {
            if (disposed || !model) return;
            motions.verse = { animation, durationSec: getAnimationDurationSec(animation) };
            model.setAnimation(animation);
            setMotionReady(true);
          })
          .catch((err: unknown) => {
            // Not fatal — the model just stays in its static pose, and no
            // play button appears since there's nothing to play.
            console.error("Failed to load MMD motion (verse)", err);
          });

        if (!motionOverrideRef.current) {
          loader
            .loadAnimation(MOTION_SOURCES.chorus.url)
            .then(({ animation }) => {
              if (disposed) return;
              motions.chorus = { animation, durationSec: getAnimationDurationSec(animation) };
            })
            .catch((err: unknown) => {
              // Not fatal — chorus sections just keep using the verse motion.
              console.error("Failed to load MMD motion (chorus)", err);
            });
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
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="viewer-miku" aria-hidden="true">
      <div className="viewer-miku__pool" />
      <div ref={containerRef} className="viewer-miku__canvas" />
      {status === "loading" && (
        <span className="viewer-miku__caption">初音ミク 読み込み中…</span>
      )}
      {status === "error" && (
        <span className="viewer-miku__caption">
          表示に失敗しました(ページの再読み込みをお試しください)
        </span>
      )}
      {status === "ready" && motionReady && !isPlaying && (
        <button type="button" className="viewer-miku__play-button" onClick={handlePlay}>
          ▶ ダンス再生
        </button>
      )}
    </div>
  );
}
