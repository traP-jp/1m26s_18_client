import { buildRoomUrl, getCertificateHash, hexToBytes } from "protocol";
import type { RoomConnectOptions } from "protocol";
import { API_BASE, WEBTRANSPORT_HOST } from "./config";

export async function getRoomConnectOptions(roomId: string): Promise<RoomConnectOptions> {
  const { certificateHash, port } = await getCertificateHash(API_BASE);
  return {
    url: buildRoomUrl({
      host: WEBTRANSPORT_HOST,
      port,
      roomId,
    }),
    serverCertificateHashes: [{ algorithm: "sha-256", value: hexToBytes(certificateHash) }],
  };
}
