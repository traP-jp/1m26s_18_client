import { useEffect, useRef, useState } from "react";
import { CalibrationScreen } from "./screens/CalibrationScreen";
import { ControllerScreen } from "./screens/ControllerScreen";
import { JoinScreen } from "./screens/JoinScreen";
import { useParticipantRoom } from "./api/useParticipantRoom";
import { useWakeLock } from "./wakeLock/useWakeLock";

type Screen = "join" | "calibration" | "controller";

const SCREENS: Screen[] = ["join", "calibration", "controller"];

function getInitialScreen(): Screen {
  const requested = new URLSearchParams(window.location.search).get("screen");
  return (SCREENS as string[]).includes(requested ?? "") ? (requested as Screen) : "join";
}

/** QRコード(?room=1234)からのアクセスなら入力を省略して直接参加させる */
function getRoomCodeFromUrl(): string | null {
  const room = new URLSearchParams(window.location.search).get("room");
  return room !== null && /^[0-9]{4}$/.test(room) ? room : null;
}

function App() {
  const [screen, setScreen] = useState<Screen>(getInitialScreen);
  const [roomId, setRoomId] = useState<string | null>(getRoomCodeFromUrl);
  // 同じコードでも再試行できるよう試行回数を数える(setState は同値だと再実行されないため)
  const [joinAttempt, setJoinAttempt] = useState(0);
  const [penlightColor, setPenlightColor] = useState("#00e5ff");
  const room = useParticipantRoom(roomId, joinAttempt);

  // スマホを振っている間は画面に触れないので、キャリブレーション〜コントローラーの間ずっと自動ロックを抑止する
  useWakeLock();

  // 参加が完了したらキャリブレーションへ進む(?screen= で直接指定された画面は優先する)。
  // 切断時に join へ戻す処理と同じコミットでは hook の状態がまだ connected のままなので、
  // roomId が残っていることを条件に含めて誤遷移を防ぐ
  useEffect(() => {
    if (roomId !== null && room.status === "connected" && screen === "join") {
      setScreen("calibration");
    }
  }, [roomId, room.status, screen]);

  const connection = room.connection;
  // onClose 内で「今アクティブな接続」かどうかを判定するためのミラー
  const activeConnectionRef = useRef<typeof connection>(null);
  activeConnectionRef.current = connection;

  // ホストが部屋を閉じるなどの予期せぬ切断が起きたらコード入力画面へ戻す
  useEffect(() => {
    if (!connection) return;
    connection.onClose = () => {
      if (activeConnectionRef.current === connection) {
        setRoomId(null);
        setScreen("join");
      }
    };
    return () => {
      if (activeConnectionRef.current === connection) {
        connection.onClose = null;
      }
    };
  }, [connection]);

  switch (screen) {
    case "join":
      return (
        <JoinScreen
          initialCode={roomId ?? ""}
          state={room}
          onJoin={(code) => {
            setRoomId(code);
            setJoinAttempt((attempt) => attempt + 1);
          }}
        />
      );
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
