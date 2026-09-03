import { Button } from "ui";

export interface TopScreenProps {
  onStart: () => void;
}

export function TopScreen({ onStart }: TopScreenProps) {
  return (
    <div className="viewer-top">
      <div className="viewer-stage-ambience" aria-hidden="true">
        <div className="viewer-stage-ambience__glow viewer-stage-ambience__glow--warm" />
        <div className="viewer-stage-ambience__glow viewer-stage-ambience__glow--cool" />
        <div className="viewer-stage-ambience__beams" />
      </div>

      <div className="viewer-top__content">
        <img
          className="viewer-top__logo"
          src="/logo-syncalive.png"
          alt="シンクアライブ SYNCALIVE feat.初音ミク"
        />
        <Button className="viewer-top__cta" onClick={onStart}>
          はじめる ▶
        </Button>
      </div>
    </div>
  );
}
