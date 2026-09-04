// 部屋接続無しでデザインだけ確認するための開発用画面だよ
import { useState } from "react";
import { Button } from "ui";
import { ServerTimeProvider } from "protocol";
import { CalibrationScreen } from "./CalibrationScreen";
import { ControllerScreen } from "./ControllerScreen";
import { LiveClockProvider } from "../live/useLiveClock";
import type { Beat } from "../api/rooms";

type PreviewTarget = "calibration" | "controller";

const PREVIEW_BEATS: readonly Beat[] = [];

export function DevPreviewScreen() {
  const [target, setTarget] = useState<PreviewTarget>("calibration");
  const [penlightColor, setPenlightColor] = useState("#00e5ff");

  return (
    <ServerTimeProvider connection={null}>
      <LiveClockProvider connection={null}>
      <div className="controller-dev-preview">
        <div className="controller-dev-preview__toolbar">
          <Button
            variant={target === "calibration" ? "primary" : "ghost"}
            onClick={() => setTarget("calibration")}
          >
            キャリブレーション
          </Button>
          <Button
            variant={target === "controller" ? "primary" : "ghost"}
            onClick={() => setTarget("controller")}
          >
            コントローラー
          </Button>
        </div>

        {target === "calibration" ? (
          <CalibrationScreen
            color={penlightColor}
            onColorChange={setPenlightColor}
            onReady={() => setTarget("controller")}
            canProceed={true}
          />
        ) : (
          <ControllerScreen
            color={penlightColor}
            onColorChange={setPenlightColor}
            beats={PREVIEW_BEATS}
          />
        )}
      </div>
      </LiveClockProvider>
    </ServerTimeProvider>
  );
}
