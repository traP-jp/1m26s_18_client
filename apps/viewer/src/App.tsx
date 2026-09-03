import { useState } from "react";
import type { ReactNode } from "react";
import { CustomCursor } from "ui";
import { UrlInputScreen } from "./screens/UrlInputScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { LiveScreen } from "./screens/LiveScreen";
import { MotionTestScreen } from "./screens/MotionTestScreen";
import type { SongData } from "./api/songs";

type Screen = "url-input" | "lobby" | "live" | "motion-test";

const SCREENS: Screen[] = ["url-input", "lobby", "live", "motion-test"];

function getInitialScreen(): Screen {
  const requested = new URLSearchParams(window.location.search).get("screen");
  return (SCREENS as string[]).includes(requested ?? "") ? (requested as Screen) : "url-input";
}

function App() {
  const [screen, setScreen] = useState<Screen>(getInitialScreen);
  const [song, setSong] = useState<SongData | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [songUrl, setSongUrl] = useState("");

  let content: ReactNode;
  switch (screen) {
    case "url-input":
      content = (
        <UrlInputScreen
          onNext={(fetchedSong, fetchedBpm, fetchedSongUrl) => {
            setSong(fetchedSong);
            setBpm(fetchedBpm);
            setSongUrl(fetchedSongUrl);
            setScreen("lobby");
          }}
        />
      );
      break;
    case "lobby":
      content = <LobbyScreen onNext={() => setScreen("live")} song={song} />;
      break;
    case "live":
      content = (
        <LiveScreen
          onSongEnd={() => setScreen("url-input")}
          song={song}
          bpm={bpm}
          songUrl={songUrl}
        />
      );
      break;
    case "motion-test":
      content = <MotionTestScreen />;
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
