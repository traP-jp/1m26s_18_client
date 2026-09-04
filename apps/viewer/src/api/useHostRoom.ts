import { useEffect, useState } from "react";
import { closeHostConnection, getHostConnection } from "./hostRoomConnection";
import type { RoomConnection } from "protocol";
import type { RoomInfo } from "./rooms";

export type HostRoomStatus = "idle" | "connecting" | "connected" | "error";

export interface HostRoomState {
  status: HostRoomStatus;
  errorMessage: string | null;
  connection: RoomConnection | null;
  participantCount: number;
}

const IDLE: HostRoomState = { status: "idle", errorMessage: null, connection: null, participantCount: 0 };
const CONNECTING: HostRoomState = { status: "connecting", errorMessage: null, connection: null, participantCount: 0 };

export function useHostRoom(room: RoomInfo | null): HostRoomState {
  const [state, setState] = useState<HostRoomState>(room ? CONNECTING : IDLE);
  const [participantIds, setParticipantIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!room) {
      void closeHostConnection();
      setParticipantIds(new Set());
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setParticipantIds(new Set());
    setState(CONNECTING);
    void getHostConnection(room)
      .then((connection) => {
        if (!cancelled) {
          setState({ status: "connected", errorMessage: null, connection, participantCount: 0 });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: "error",
            errorMessage:
              error instanceof Error ? error.message : "サーバーへの接続に失敗しました",
            connection: null,
            participantCount: 0,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [room]);

  const connection = state.connection;
  useEffect(() => {
    if (!connection) {
      return;
    }
    return connection.subscribeServerMessage((message) => {
      if (message.type !== "participantJoined") {
        return;
      }
      setParticipantIds((prev) => {
        if (prev.has(message.participantId)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(message.participantId);
        return next;
      });
    });
  }, [connection]);

  return { ...state, participantCount: participantIds.size };
}
