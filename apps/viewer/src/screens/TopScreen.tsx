export interface TopScreenProps {
  onStart: () => void;
}

// 専用の「はじめる」ボタンではなく、画面のどこをタップ/クリックしても
// 次へ進む「Press Any Key」方式。
export function TopScreen({ onStart }: TopScreenProps) {
  return (
    <div
      className="viewer-top"
      role="button"
      tabIndex={0}
      onClick={onStart}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onStart();
      }}
    >
      <div className="stage-ambience" aria-hidden="true">
        <div className="stage-ambience__glow stage-ambience__glow--warm" />
        <div className="stage-ambience__glow stage-ambience__glow--cool" />
        <div className="stage-ambience__beams" />
      </div>

      <div className="viewer-top__content">
        <img
          className="viewer-top__logo"
          src="/logo-syncalive.png"
          alt="シンクアライブ SYNCALIVE feat.初音ミク"
        />
        <p className="viewer-top__hint">タップしてはじめる</p>
      </div>
    </div>
  );
}
