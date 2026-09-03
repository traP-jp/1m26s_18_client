import { RoomConnection } from "protocol";
import { getRoomConnectOptions } from "./rooms";

export interface ParticipantRoom {
  connection: RoomConnection;
  participantId: string;
}

let active: { roomId: string; room: Promise<ParticipantRoom> } | null = null;

export function getParticipantRoom(roomId: string): Promise<ParticipantRoom> {
  const key = roomId;
  if (active?.roomId === key) {
    return active.room;
  }
  void closeParticipantRoom();
  const room = (async () => {
    const options = await getRoomConnectOptions(roomId);
    let connection: RoomConnection;
    try {
      connection = await RoomConnection.connect(options);
    } catch (error) {
      // 部屋が存在しない・ホストが未参加などはセッションレベルで拒否されるため、
      // ブラウザの生のエラーではなく理解しやすいメッセージに差し替える
      throw new Error(
        "部屋に接続できませんでした。コードを確認するか、しばらく待ってから再試行してください。",
        { cause: error },
      );
    }
    try {
      const participantId = await connection.join();
      return { connection, participantId };
    } catch (error) {
      connection.onClose = null;
      connection.close();
      throw error;
    }
  })();
  active = { roomId: key, room };
  void room.catch(() => {
    if (active?.room === room) {
      active = null;
    }
  });
  return room;
}

export async function closeParticipantRoom(): Promise<void> {
  const current = active;
  active = null;
  if (!current) return;
  try {
    const { connection } = await current.room;
    // 意図的な切断なので、App 側の「予期せぬ切断」ハンドラを発火させない
    connection.onClose = null;
    connection.close();
  } catch {
    // 接続確立前に失敗していた場合は閉じる対象がない
  }
}
