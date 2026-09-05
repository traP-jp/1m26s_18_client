import { RoomConnection } from "protocol";
import { getRoomConnectOptions } from "./rooms";
import type { RoomInfo } from "./rooms";

let active: { key: string; connection: Promise<RoomConnection> } | null = null;

function keyOf(room: RoomInfo): string {
  return `${room.roomId}:${room.hostToken}`;
}

export function getHostConnection(room: RoomInfo): Promise<RoomConnection> {
  const key = keyOf(room);
  if (active?.key === key) {
    return active.connection;
  }
  void closeHostConnection();
  const connection = (async () => {
    const options = await getRoomConnectOptions(room);
    const conn = await RoomConnection.connect(options);
    try {
      await conn.join();
    } catch (error) {
      conn.close();
      throw error;
    }
    return conn;
  })();
  active = { key, connection };
  void connection.catch(() => {
    if (active?.connection === connection) {
      active = null;
    }
  });
  return connection;
}

export async function closeHostConnection(): Promise<void> {
  const current = active;
  active = null;
  if (!current) return;
  try {
    const conn = await current.connection;
    // 意図的な切断なので、呼び出し側の「予期せぬ切断」ハンドラを発火させない
    conn.onClose = null;
    conn.close();
  } catch {
    // 接続確立前に失敗していた場合は閉じる対象がない
  }
}
