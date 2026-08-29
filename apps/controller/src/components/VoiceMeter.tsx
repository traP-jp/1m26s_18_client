import { useEffect, useRef, useState } from "react";

type MicStatus = "idle" | "requesting" | "active" | "denied";

export function VoiceMeter() {
  const [status, setStatus] = useState<MicStatus>("idle");
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setLevel(0);
    setStatus("idle");
  };

  const start = async () => {
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const normalized = (data[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        setLevel(Math.min(100, rms * 260));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setStatus("active");
    } catch (err) {
      console.error("Microphone access failed", err);
      setStatus("denied");
    }
  };

  useEffect(() => stop, []);

  const isActive = status === "active";

  return (
    <div className="controller-voice-meter">
      <button
        type="button"
        className={`controller-voice-meter__toggle ${isActive ? "controller-voice-meter__toggle--active" : ""}`.trim()}
        onClick={isActive ? stop : start}
      >
        <span>{isActive ? "歌唱中" : "歌う"}</span>
      </button>

      {isActive && (
        <div className="controller-voice-meter__bar" aria-label="声量メーター">
          <div className="controller-voice-meter__bar-fill" style={{ width: `${level}%` }} />
        </div>
      )}
      {status === "requesting" && (
        <span className="controller-voice-meter__hint">マイクへのアクセスを許可してください…</span>
      )}
      {status === "denied" && (
        <span className="controller-voice-meter__hint">許可設定を確認してください</span>
      )}
    </div>
  );
}
