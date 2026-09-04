import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SHAKE_THRESHOLD_PCT, useMotionIntensity, useShake } from "../motion/useMotion";

export interface Penlight3DProps {
  color: string;
}

const PARTICLE_COUNT = 140;
// パーティクルを漂わせる範囲(カメラは原点、-Z方向を向いている)
const BOUNDS = { x: 2.2, y: 2.2, zNear: -0.4, zFar: -4.5 };

// 中心に置いた色付きポイントライトが、カメラを包む球の内側を照らすことで
// 「キャンバス全体が光っている」グラデーションを作る(個別の物体を描画しない)。
// その手前に加算合成の光の粒子(パーティクル)を漂わせて、光の中にいる質感を足す。
function makeParticleSprite(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.6)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function Penlight3D({ color }: Penlight3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef(color);
  colorRef.current = color;
  const [pressed, setPressed] = useState(false);
  const pressedRef = useRef(pressed);
  pressedRef.current = pressed;
  const intensity = useMotionIntensity();
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;
  const flashUntilRef = useRef(0);

  // しきい値を超える振りが検出された瞬間、一瞬だけ強く光らせる
  useShake((shake) => {
    if (shake.intensity < SHAKE_THRESHOLD_PCT) return;
    flashUntilRef.current = performance.now() + 220;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20);
    camera.position.set(0, 0, 0.01);

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    container.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.1, 0.6, 0.15);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    // カメラを包む球。内側(BackSide)だけを描画し、中心近くのポイントライトで
    // 照らすことで手前が明るく奥が暗いグラデーションの「光の空間」になる。
    const envSphere = new THREE.Mesh(
      new THREE.SphereGeometry(6, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.BackSide }),
    );
    scene.add(envSphere);

    const glowLight = new THREE.PointLight(new THREE.Color(colorRef.current), 30, 9, 1.6);
    glowLight.position.set(0, 0, -1.2);
    scene.add(glowLight);
    scene.add(new THREE.AmbientLight(new THREE.Color(colorRef.current), 0.25));

    // 光の粒子。加算合成+スプライトで、暗い場所でも光の粒として浮かんで見える
    const spriteTexture = makeParticleSprite();
    const particleCount = PARTICLE_COUNT;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const seeds = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * BOUNDS.x;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * BOUNDS.y;
      positions[i * 3 + 2] = BOUNDS.zNear + Math.random() * (BOUNDS.zFar - BOUNDS.zNear);
      velocities[i * 3] = (Math.random() - 0.5) * 0.06;
      velocities[i * 3 + 1] = Math.random() * 0.05 + 0.02;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.16,
      map: spriteTexture,
      color: new THREE.Color(colorRef.current),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight);
      composer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const targetFrameIntervalMs = 1000 / 30;
    let lastFrameTime = 0;
    renderer.setAnimationLoop((timeMs: number) => {
      if (timeMs - lastFrameTime < targetFrameIntervalMs) return;
      const dtSec = lastFrameTime ? Math.min((timeMs - lastFrameTime) / 1000, 0.1) : 0;
      lastFrameTime = timeMs;

      const flashing = timeMs < flashUntilRef.current;
      const glow = flashing ? 100 : Math.max(intensityRef.current, pressedRef.current ? 100 : 0);
      const glowNorm = glow / 100;

      const tint = new THREE.Color(colorRef.current);
      glowLight.color.copy(tint);
      glowLight.intensity = 10 + glowNorm * 10;
      particleMaterial.color.copy(tint);
      particleMaterial.size = 0.14 + glowNorm * 0.1;
      particleMaterial.opacity = 0.7 + glowNorm * 0.3;

      // 粒子はゆっくり上に漂いつつ、抜けたら反対側から再登場させる(ループ)
      const posAttr = particleGeometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i++) {
        const ix = i * 3;
        let x = posAttr.array[ix] + velocities[ix] * dtSec * 10 + Math.sin(timeMs * 0.0004 + seeds[i]) * 0.002;
        let y = posAttr.array[ix + 1] + velocities[ix + 1] * dtSec * 10;
        let z = posAttr.array[ix + 2] + velocities[ix + 2] * dtSec * 10;
        if (y > BOUNDS.y) y = -BOUNDS.y;
        if (x > BOUNDS.x) x = -BOUNDS.x;
        if (x < -BOUNDS.x) x = BOUNDS.x;
        if (z > BOUNDS.zNear) z = BOUNDS.zFar;
        if (z < BOUNDS.zFar) z = BOUNDS.zNear;
        posAttr.array[ix] = x;
        posAttr.array[ix + 1] = y;
        posAttr.array[ix + 2] = z;
      }
      posAttr.needsUpdate = true;

      composer.render();
    });

    return () => {
      resizeObserver.disconnect();
      renderer.setAnimationLoop(null);
      composer.dispose();
      renderer.dispose();
      envSphere.geometry.dispose();
      (envSphere.material as THREE.Material).dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      spriteTexture.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="controller-penlight3d"
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
    />
  );
}
