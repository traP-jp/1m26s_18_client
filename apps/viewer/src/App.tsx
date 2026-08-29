import { useState } from "react";
import { UrlInputScreen } from "./screens/UrlInputScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { LiveScreen } from "./screens/LiveScreen";
import type { SongData } from "./api/songs";

type Screen = "url-input" | "lobby" | "live";

const SCREENS: Screen[] = ["url-input", "lobby", "live"];

function getInitialScreen(): Screen {
  const requested = new URLSearchParams(window.location.search).get("screen");
  return (SCREENS as string[]).includes(requested ?? "") ? (requested as Screen) : "url-input";
}

function App() {
  const [screen, setScreen] = useState<Screen>(getInitialScreen);
  const [song, setSong] = useState<SongData | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);

  switch (screen) {
    case "url-input":
      return (
        <UrlInputScreen
          onNext={(fetchedSong, fetchedBpm) => {
            setSong(fetchedSong);
            setBpm(fetchedBpm);
            setScreen("lobby");
          }}
        />
      );
    case "lobby":
      return <LobbyScreen onNext={() => setScreen("live")} />;
    case "live":
      return <LiveScreen onSongEnd={() => setScreen("url-input")} song={song} bpm={bpm} />;
  }
}
export default App;
