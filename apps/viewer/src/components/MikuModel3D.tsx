import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ThreeMmdLoader, disposeMmdModel } from "@yohawing/three-mmd-loader";
import type { ThreeMmdModel, MmdAnimation } from "@yohawing/three-mmd-loader";

const MODEL_URL = "/mmd/piloula-miku-expo10th.pmx";
const MOTION_URL = "/mmd/Helltaker-like_dance/Helltaker_like_dance_1min_1.vmd";
const MMD_FPS = 30;

// このVMDが振り付けられた元曲のテンポは公開情報がないため実測できておらず、
// 動きの体感に基づく暫定値。曲のBPMとの比でループ再生速度をスケールする。
const REFERENCE_BPM = 120;
const MIN_PLAYBACK_RATE = 0.5;
const MAX_PLAYBACK_RATE = 2;

function computePlaybackRate(bpm: number | null | undefined): number {
  if (!bpm || bpm <= 0) return 1;
  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, bpm / REFERENCE_BPM));
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
  bpm?: number | null;
  onPlay?: () => void;
}

export function MikuModel3D({ bpm, onPlay }: MikuModel3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [motionReady, setMotionReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // The render loop below lives inside a mount-once effect and reads these
  // every frame — refs (not state) so a button click (or a bpm prop change)
  // can steer it without tearing down and rebuilding the whole WebGL scene.
  const isPlayingRef = useRef(false);
  const playStartTimeRef = useRef(0);
  const playbackRateRef = useRef(computePlaybackRate(bpm));

  useEffect(() => {
    playbackRateRef.current = computePlaybackRate(bpm);
  }, [bpm]);

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
    let motionDurationSec = 0;

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

        model.update(0);
        setStatus("ready");

        // Until "再生" is pressed, she just sways gently in place. Pressing
        // the button starts the VMD from time 0 and loops it from then on.
        const targetFrameIntervalMs = 1000 / 24;
        let lastFrameTime = 0;
        renderer.setAnimationLoop((timeMs: number) => {
          if (timeMs - lastFrameTime < targetFrameIntervalMs) return;
          lastFrameTime = timeMs;
          if (model) {
            if (isPlayingRef.current && motionDurationSec > 0) {
              const elapsedSec =
                ((timeMs - playStartTimeRef.current) / 1000) * playbackRateRef.current;
              model.update(elapsedSec % motionDurationSec);
            } else {
              model.root.rotation.y = Math.sin(timeMs * 0.00015) * 0.35;
            }
          }
          renderer.render(scene, camera);
        });

        loader
          .loadAnimation(MOTION_URL)
          .then(({ animation }) => {
            if (disposed || !model) return;
            model.setAnimation(animation);
            motionDurationSec = getAnimationDurationSec(animation);
            setMotionReady(true);
          })
          .catch((err: unknown) => {
            // Not fatal — the model just stays in its static pose, and no
            // play button appears since there's nothing to play.
            console.error("Failed to load MMD motion", err);
          });
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
