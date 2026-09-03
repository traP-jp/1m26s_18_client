import { QRCodeSVG } from "qrcode.react";

export interface RoomJoinCardProps {
  roomCode: string;
  joinUrl: string;
}

export function RoomJoinCard({ roomCode, joinUrl }: RoomJoinCardProps) {
  return (
    <div className="ui-room-join">
      <div className="ui-room-join__qr">
        <QRCodeSVG
          value={joinUrl}
          size={72}
          marginSize={4}
          bgColor="#ffffff"
          fgColor="#000000"
          aria-label={`部屋参加QRコード(${roomCode})`}
        />
      </div>
      <div className="ui-room-join__info">
        <span className="ui-room-join__label">ルームコード</span>
        <span className="ui-room-join__code">{roomCode}</span>
        <span className="ui-room-join__url">{joinUrl}</span>
      </div>
    </div>
  );
}
