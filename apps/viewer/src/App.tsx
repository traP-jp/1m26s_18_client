import { useState } from "react";
import { CustomCursor } from "ui";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { ServerTimeProvider } from "protocol";
import { TopScreen } from "./screens/TopScreen";
import { UrlInputScreen } from "./screens/UrlInputScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { LiveScreen } from "./screens/LiveScreen";
import { MotionTestScreen } from "./screens/MotionTestScreen";
import { useHostRoom } from "./api/useHostRoom";
import type { RoomInfo } from "./api/rooms";
import type { SongData } from "./api/songs";

function App() {
  const [, navigate] = useLocation();
  const [song, setSong] = useState<SongData | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [songUrl, setSongUrl] = useState("");
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const hostRoom = useHostRoom(room);

  return (
    <>
      <CustomCursor />
      <ServerTimeProvider connection={hostRoom.connection}>
        <Switch>
          <Route path="/">
            <TopScreen onStart={() => navigate("/select")} />
          </Route>
          <Route path="/select">
            <UrlInputScreen
              onNext={(fetchedSong, fetchedBpm, fetchedSongUrl, fetchedRoom) => {
                setSong(fetchedSong);
                setBpm(fetchedBpm);
                setSongUrl(fetchedSongUrl);
                setRoom(fetchedRoom);
                navigate("/lobby");
              }}
            />
          </Route>
          <Route path="/lobby">
            <LobbyScreen
              onNext={() => navigate("/live")}
              song={song}
              room={room}
              hostRoom={hostRoom}
            />
          </Route>
          <Route path="/live">
            <LiveScreen
              onSongEnd={() => {
                setRoom(null);
                navigate("/");
              }}
              song={song}
              bpm={bpm}
              songUrl={songUrl}
              connection={hostRoom.connection}
              participantCount={hostRoom.participantCount}
            />
          </Route>
          <Route path="/motion-test">
            <MotionTestScreen />
          </Route>
          <Route path="/:rest*">
            <Redirect to="/" replace />
          </Route>
        </Switch>
      </ServerTimeProvider>
    </>
  );
}
export default App;
