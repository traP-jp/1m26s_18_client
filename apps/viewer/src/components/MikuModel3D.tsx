import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ThreeMmdLoader, disposeMmdModel } from "@yohawing/three-mmd-loader";
import type { ThreeMmdModel } from "@yohawing/three-mmd-loader";
import type { RefObject } from "react";
import { MmdPoseDriver } from "../pose/MmdPoseDriver";
import type { PoseFrame } from "../pose/landmarks";
import type { VmdMotionRecorder } from "../pose/VmdMotionRecorder";

const MODEL_URL = "/mmd/piloula-miku-expo10th.pmx";

type Status = "loading" | "ready" | "error";

export interface MikuModel3DProps {
  /**
   * 姿勢推定の最新フレーム。値が入っている間はランドマークでボーンを駆動し、
   * null の間は従来の静止ポーズ+ゆっくりした揺れに戻る。
   */
  poseFrameRef?: RefObject<PoseFrame | null>;
  /** 鏡写しにするか(デフォルト true) */
  mirror?: boolean;
  /** 渡すと、姿勢駆動中の毎フレームをこのレコーダーへ記録する(録画中のみ) */
  vmdRecorder?: VmdMotionRecorder;
}

export function MikuModel3D({ poseFrameRef, mirror = true, vmdRecorder }: MikuModel3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  // ref 経由で読むことで、mirror が変わってもシーンを作り直さずに済む
  const poseFrameRefRef = useRef(poseFrameRef);
  poseFrameRefRef.current = poseFrameRef;
  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;
  const vmdRecorderRef = useRef(vmdRecorder);
  vmdRecorderRef.current = vmdRecorder;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let model: ThreeMmdModel | null = null;
    let poseDriver: MmdPoseDriver | null = null;
    let wasPoseDriven = false;

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

    new ThreeMmdLoader()
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
        // Bones are driven directly (bypassing the loader runtime) while pose
        // tracking is active. Must be created after update(0) so reset() restores
        // the runtime's initial pose.
        poseDriver = new MmdPoseDriver(model.mesh, { mirror: mirrorRef.current });
        if (poseDriver.missingBones.length > 0) {
          console.warn("MmdPoseDriver: bones not found in model", poseDriver.missingBones);
        }
        setStatus("ready");

        // Pose is static (no VMD bound), so the only per-frame work is a slow sway —
        // capping the loop well below display refresh rate keeps sustained GPU load
        // low, which is what avoids the context-loss crash on weaker/software GPUs.
        // Pose tracking is applied at the same capped rate (the webcam is ~30fps anyway).
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
              vmdRecorderRef.current?.capture(poseDriver, timeMs);
              // face the audience while mimicking; ease the sway out
              model.root.rotation.y *= 0.8;
              wasPoseDriven = true;
            } else {
              if (wasPoseDriven && poseDriver) {
                poseDriver.reset();
                wasPoseDriven = false;
              }
              model.root.rotation.y = Math.sin(timeMs * 0.00015) * 0.35;
            }
          }
          renderer.render(scene, camera);
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
      {status === "ready" && <span className="viewer-miku__caption"></span>}
    </div>
  );
}
