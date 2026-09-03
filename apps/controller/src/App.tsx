import { useState } from "react";
import type { ReactNode } from "react";
import { CustomCursor } from "ui";
import { CalibrationScreen } from "./screens/CalibrationScreen";
import { ControllerScreen } from "./screens/ControllerScreen";

type Screen = "calibration" | "controller";

const SCREENS: Screen[] = ["calibration", "controller"];

function getInitialScreen(): Screen {
  const requested = new URLSearchParams(window.location.search).get("screen");
  return (SCREENS as string[]).includes(requested ?? "") ? (requested as Screen) : "calibration";
}

function App() {
  const [screen, setScreen] = useState<Screen>(getInitialScreen);
  const [penlightColor, setPenlightColor] = useState("#00e5ff");

  let content: ReactNode;
  switch (screen) {
    case "calibration":
      content = (
        <CalibrationScreen
          color={penlightColor}
          onColorChange={setPenlightColor}
          onReady={() => setScreen("controller")}
        />
      );
      break;
    case "controller":
      content = <ControllerScreen color={penlightColor} onColorChange={setPenlightColor} />;
      break;
  }

  return (
    <>
      <CustomCursor />
      {content}
    </>
  );
}

export default App;
