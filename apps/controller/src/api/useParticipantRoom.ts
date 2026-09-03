import { useEffect, useState } from "react";
import { closeParticipantRoom, getParticipantRoom } from "./participantRoomConnection";
import type { RoomConnection } from "protocol";

export type ParticipantRoomStatus = "idle" | "connecting" | "connected" | "error";

export interface ParticipantRoomState {
  status: ParticipantRoomStatus;
  errorMessage: string | null;
  connection: RoomConnection | null;
  participantId: string | null;
}

const IDLE: ParticipantRoomState = {
  status: "idle",
  errorMessage: null,
  connection: null,
  participantId: null,
};

export function useParticipantRoom(roomId: string | null, attempt: number): ParticipantRoomState {
  const [state, setState] = useState<ParticipantRoomState>(() =>
    roomId ? { status: "connecting", errorMessage: null, connection: null, participantId: null } : IDLE,
  );

  useEffect(() => {
    if (!roomId) {
      void closeParticipantRoom();
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setState({ status: "connecting", errorMessage: null, connection: null, participantId: null });
    void getParticipantRoom(roomId)
      .then(({ connection, participantId }) => {
        // StrictMode の二重マウントでは同じシングルトン接続を共有するため、
        // cancelled でも close してはいけない(部屋の切り替え時は
        // getParticipantRoom 内の closeParticipantRoom が処理する)
        if (cancelled) {
          return;
        }
        setState({ status: "connected", errorMessage: null, connection, participantId });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: "error",
            errorMessage:
              error instanceof Error ? error.message : "部屋への参加に失敗しました",
            connection: null,
            participantId: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, attempt]);

  return state;
}
