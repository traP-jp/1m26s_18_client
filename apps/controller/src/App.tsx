import { useState } from "react";
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

  switch (screen) {
    case "calibration":
      return (
        <CalibrationScreen
          color={penlightColor}
          onColorChange={setPenlightColor}
          onReady={() => setScreen("controller")}
        />
      );
    case "controller":
      return <ControllerScreen color={penlightColor} onColorChange={setPenlightColor} />;
  }
}

export default App;
