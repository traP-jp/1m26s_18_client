// 部屋接続無しでデザインだけ確認するための開発用画面だよ
import { useState } from "react";
import { Button } from "ui";
import { ServerTimeProvider } from "protocol";
import { CalibrationScreen } from "./CalibrationScreen";
import { ControllerScreen } from "./ControllerScreen";

type PreviewTarget = "calibration" | "controller";

export function DevPreviewScreen() {
  const [target, setTarget] = useState<PreviewTarget>("calibration");
  const [penlightColor, setPenlightColor] = useState("#00e5ff");

  return (
    <ServerTimeProvider connection={null}>
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
          />
        ) : (
          <ControllerScreen color={penlightColor} onColorChange={setPenlightColor} />
        )}
      </div>
    </ServerTimeProvider>
  );
}
