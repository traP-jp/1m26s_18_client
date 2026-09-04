import { useCallback, useEffect, useRef, useState } from "react";
import { CustomCursor } from "ui";
import { Redirect, Route, Switch, useLocation, useParams } from "wouter";
import { ServerTimeProvider } from "protocol";
import { TopScreen } from "./screens/TopScreen";
import { UrlInputScreen } from "./screens/UrlInputScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { LiveScreen } from "./screens/LiveScreen";
import { MotionTestScreen } from "./screens/MotionTestScreen";
import { useHostRoom } from "./api/useHostRoom";
import type { RoomInfo } from "./api/rooms";
import type { SongData } from "./api/songs";

const ROOM_ROUTE = "/room/:code";

interface RoomSession {
  song: SongData;
  bpm: number | null;
  songUrl: string;
  room: RoomInfo;
}

// 部屋スコープの画面(/room/:code 配下)。ホスト接続のライフサイクルは
// ここで保持するため、このスコープを外れるとWebTransport接続は切断される。
// ホスト切断=部屋破棄のため、セッションはメモリ保持のみでリロード復元はしない。
function RoomLayout({
  session,
  onLeave,
}: {
  session: RoomSession | null;
  onLeave: () => void;
}) {
  const { code } = useParams();
  const [, navigate] = useLocation();
  // URLの部屋IDと保持中のセッションが一致する場合のみ部屋を開く
  const room = session !== null && session.room.roomId === code ? session.room : null;
  const hostRoom = useHostRoom(room);

  const leaveRoom = useCallback(() => {
    onLeave();
    navigate("~/");
  }, [navigate, onLeave]);

  const connection = hostRoom.connection;
  // onClose 内で「今アクティブな接続」かどうかを判定するためのミラー
  const activeConnectionRef = useRef<typeof connection>(null);
  activeConnectionRef.current = connection;

  // ホストの切断は部屋の破棄を意味するため、予期せぬ切断が起きたら部屋スコープの外へ出る
  useEffect(() => {
    if (!connection) return;
    connection.onClose = () => {
      if (activeConnectionRef.current === connection) {
        leaveRoom();
      }
    };
    return () => {
      if (activeConnectionRef.current === connection) {
        connection.onClose = null;
      }
    };
  }, [connection, leaveRoom]);

  if (room === null || session === null) {
    return <Redirect to="~/select" replace />;
  }

  return (
    <ServerTimeProvider connection={hostRoom.connection}>
      <Switch>
        <Route path="/live">
          <LiveScreen
            onSongEnd={leaveRoom}
            song={session.song}
            bpm={session.bpm}
            songUrl={session.songUrl}
            connection={hostRoom.connection}
            participantCount={hostRoom.participantCount}
          />
        </Route>
        <Route path="/lobby">
          <LobbyScreen
            onNext={() => navigate("/live")}
            song={session.song}
            room={session.room}
            hostRoom={hostRoom}
          />
        </Route>
        {/* /room/:code 直下・未知のサブパスはロビー(部屋の既定画面) */}
        <Route>
          <Redirect to="/lobby" replace />
        </Route>
      </Switch>
    </ServerTimeProvider>
  );
}

function App() {
  const [, navigate] = useLocation();
  const [session, setSession] = useState<RoomSession | null>(null);

  const handleLeave = useCallback(() => {
    setSession(null);
  }, []);

  return (
    <>
      <CustomCursor />
      <Switch>
        <Route path="/">
          <TopScreen onStart={() => navigate("/select")} />
        </Route>
        <Route path="/select">
          <UrlInputScreen
            onNext={(fetchedSong, fetchedBpm, fetchedSongUrl, fetchedRoom) => {
              setSession({
                song: fetchedSong,
                bpm: fetchedBpm,
                songUrl: fetchedSongUrl,
                room: fetchedRoom,
              });
              navigate(`/room/${fetchedRoom.roomId}/lobby`);
            }}
          />
        </Route>
        <Route path={ROOM_ROUTE} nest>
          <RoomLayout session={session} onLeave={handleLeave} />
        </Route>
        <Route path="/motion-test">
          <MotionTestScreen />
        </Route>
        <Route path="/:rest*">
          <Redirect to="/" replace />
        </Route>
      </Switch>
    </>
  );
}
export default App;
