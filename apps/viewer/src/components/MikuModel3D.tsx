import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ThreeMmdLoader, disposeMmdModel } from "@yohawing/three-mmd-loader";
import type { ThreeMmdModel, MmdAnimation } from "@yohawing/three-mmd-loader";
import type { Segment } from "../api/songs";
import { getMotionById } from "../motions";
import type { MotionDefinition } from "../motions";

const MODEL_URL = "/mmd/piloula-miku-expo10th.pmx";

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
  bpm?: number | null;
  onPlay?: () => void;
  // 曲の実再生位置[ms]を返す関数
  getPositionMs?: () => number;
  startAtMs?: number;
  segments?: Segment[];
  motionOverride?: MotionSource;
  // 曲側(SongPlayer)がrequestPlay()を呼んでも安全な状態になっているか。
  // 未指定ならtrue扱い(曲データなしのプレビュー用フォールバック)。
  readyToPlay?: boolean;
}

export function MikuModel3D({
  bpm,
  onPlay,
  getPositionMs,
  startAtMs,
  segments,
  motionOverride,
  readyToPlay = true,
}: MikuModel3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [motionReady, setMotionReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
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
    // モーションIDごとに読み込み済みのアニメーションをキャッシュ
    // プール間で同じIDが重複しても1回しか読み込まない
    const loadedMotions = new Map<string, { animation: MmdAnimation; durationSec: number }>();
    let activeMotionKey: MotionKey = "verse";
    let activeMotionId: string | null = null;
    let activeSegmentStartMs = 0;
    const occurrenceCount: Record<MotionKey, number> = { verse: 0, chorus: 0 };
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 100);
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

        model.update(0);
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
            const danceElapsedSec = isPlayingRef.current ? computeDanceElapsedSec(timeMs) : null;
            if (danceElapsedSec !== null) {
              model.update(danceElapsedSec);
            } else {
              model.root.rotation.y = Math.sin(timeMs * 0.00015) * 0.35;
            }
          }
          renderer.render(scene, camera);
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
      {status === "ready" && motionReady && readyToPlay && !isPlaying && (
        <button type="button" className="viewer-miku__play-button" onClick={handlePlay}>
          ▶ ライブ開始
        </button>
      )}
    </div>
  );
}
