export interface RoomJoinCardProps {
  roomCode: string;
  joinUrl?: string;
}

export function RoomJoinCard({ roomCode, joinUrl }: RoomJoinCardProps) {
  return (
    <div className="ui-room-join">
      <div className="ui-room-join__qr" aria-label="QRコード(プレースホルダー)">
        QR
      </div>
      <div className="ui-room-join__info">
        <span className="ui-room-join__label">ルームコード</span>
        <span className="ui-room-join__code">{roomCode}</span>
        {joinUrl && <span className="ui-room-join__url">{joinUrl}</span>}
      </div>
    </div>
  );
}
