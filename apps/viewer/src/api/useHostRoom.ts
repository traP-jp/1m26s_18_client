import { useEffect, useState } from "react";
import { closeHostConnection, getHostConnection } from "./hostRoomConnection";
import type { RoomConnection } from "protocol";
import type { RoomInfo } from "./rooms";

export type HostRoomStatus = "idle" | "connecting" | "connected" | "error";

export interface HostRoomState {
  status: HostRoomStatus;
  errorMessage: string | null;
  connection: RoomConnection | null;
}

const IDLE: HostRoomState = { status: "idle", errorMessage: null, connection: null };
const CONNECTING: HostRoomState = { status: "connecting", errorMessage: null, connection: null };

export function useHostRoom(room: RoomInfo | null): HostRoomState {
  const [state, setState] = useState<HostRoomState>(room ? CONNECTING : IDLE);

  useEffect(() => {
    if (!room) {
      void closeHostConnection();
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setState(CONNECTING);
    void getHostConnection(room)
      .then((connection) => {
        if (!cancelled) {
          setState({ status: "connected", errorMessage: null, connection });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: "error",
            errorMessage:
              error instanceof Error ? error.message : "サーバーへの接続に失敗しました",
            connection: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [room]);

  return state;
}
