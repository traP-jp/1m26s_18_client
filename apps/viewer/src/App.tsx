import { useState } from "react";
import { UrlInputScreen } from "./screens/UrlInputScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { LiveScreen } from "./screens/LiveScreen";

type Screen = "url-input" | "lobby" | "live";

const SCREENS: Screen[] = ["url-input", "lobby", "live"];

function getInitialScreen(): Screen {
  const requested = new URLSearchParams(window.location.search).get("screen");
  return (SCREENS as string[]).includes(requested ?? "") ? (requested as Screen) : "url-input";
}

function App() {
  const [screen, setScreen] = useState<Screen>(getInitialScreen);

  switch (screen) {
    case "url-input":
      return <UrlInputScreen onNext={() => setScreen("lobby")} />;
    case "lobby":
      return <LobbyScreen onNext={() => setScreen("live")} />;
    case "live":
      return <LiveScreen onSongEnd={() => setScreen("url-input")} />;
  }
}
export default App;
