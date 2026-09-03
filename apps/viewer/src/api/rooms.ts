import { buildRoomUrl, createRoom, getCertificateHash, hexToBytes } from "protocol";
import type { CreateRoomResult, RoomConnectOptions } from "protocol";
import { API_BASE, WEBTRANSPORT_HOST } from "./config";

export type RoomInfo = CreateRoomResult;

export async function createRoomForSong(songUrl: string): Promise<RoomInfo> {
  return createRoom(API_BASE, songUrl);
}

export async function getRoomConnectOptions(room: RoomInfo): Promise<RoomConnectOptions> {
  const { certificateHash, port } = await getCertificateHash(API_BASE);
  return {
    url: buildRoomUrl({
      host: WEBTRANSPORT_HOST,
      port,
      roomId: room.roomId,
      hostToken: room.hostToken,
    }),
    serverCertificateHashes: [{ algorithm: "sha-256", value: hexToBytes(certificateHash) }],
  };
}
