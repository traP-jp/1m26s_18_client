import { useEffect, useRef, useState } from "react";
import { Redirect, Route, Switch, useLocation, useParams } from "wouter";
import { CalibrationScreen } from "./screens/CalibrationScreen";
import { ControllerScreen } from "./screens/ControllerScreen";
import { JoinScreen } from "./screens/JoinScreen";
import { useParticipantRoom } from "./api/useParticipantRoom";
import { useWakeLock } from "./wakeLock/useWakeLock";

const ROOM_ROUTE = "/room/:code";
const ROOM_CODE_PATTERN = /^[0-9]{4}$/;

// 部屋スコープの画面(/room/:code 配下)。参加接続のライフサイクルと
// セッション中の状態(ペンライト色など)はここで保持するため、URL が
// このスコープにある間はリロードしても同じ部屋に再参加できる
function RoomLayout() {
  const { code } = useParams();
  const [, navigate] = useLocation();
  // QRコード(/room/1234)からのアクセスなら入力を省略して直接参加させる。
  // 4桁以外のコードを含むURLはルートへ戻す
  const roomCode = code !== undefined && ROOM_CODE_PATTERN.test(code) ? code : null;
  const [penlightColor, setPenlightColor] = useState("#00e5ff");
  const room = useParticipantRoom(roomCode);

  const connection = room.connection;
  // onClose 内で「今アクティブな接続」かどうかを判定するためのミラー
  const activeConnectionRef = useRef<typeof connection>(null);
  activeConnectionRef.current = connection;

  // ホストが部屋を閉じるなどの予期せぬ切断が起きたら部屋スコープの外へ出る
  useEffect(() => {
    if (!connection) return;
    connection.onClose = () => {
      if (activeConnectionRef.current === connection) {
        navigate("~/");
      }
    };
    return () => {
      if (activeConnectionRef.current === connection) {
        connection.onClose = null;
      }
    };
  }, [connection, navigate]);

  // 部屋に参加できなければコードの再入力のためルートへ戻す
  useEffect(() => {
    if (room.status === "error") {
      navigate("~/", { replace: true });
    }
  }, [room.status, navigate]);

  if (roomCode === null) {
    return <Redirect to="~/" replace />;
  }

  return (
    <Switch>
      <Route path="/controller">
        <ControllerScreen color={penlightColor} onColorChange={setPenlightColor} />
      </Route>
      {/* /room/:code ルート・/calibration・未知のサブパスはすべてキャリブレーション(部屋の既定画面) */}
      <Route>
        <CalibrationScreen
          color={penlightColor}
          onColorChange={setPenlightColor}
          onReady={() => navigate("/controller")}
        />
      </Route>
    </Switch>
  );
}

function App() {
  const [, navigate] = useLocation();

  // スマホを振っている間は画面に触れないので、キャリブレーション〜コントローラーの間ずっと自動ロックを抑止する
  useWakeLock();

  return (
    <Switch>
      <Route path="/">
        <JoinScreen onJoin={(code) => navigate(`/room/${code}`)} />
      </Route>
      <Route path={ROOM_ROUTE} nest>
        <RoomLayout />
      </Route>
      {/* 未知のパス(複数セグメント含む)は参加コード入力へ */}
      <Route>
        <Redirect to="/" replace />
      </Route>
    </Switch>
  );
}

export default App;
