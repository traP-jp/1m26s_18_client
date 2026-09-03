import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Panel } from "ui";

export interface JoinScreenProps {
  onJoin: (roomCode: string) => void;
}

const ROOM_CODE_PATTERN = /^[0-9]{4}$/;

export function JoinScreen({ onJoin }: JoinScreenProps) {
  const [code, setCode] = useState("");
  const valid = ROOM_CODE_PATTERN.test(code);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    onJoin(code);
  };

  return (
    <div className="controller-join">
      <Panel className="controller-join__panel" glow>
        <p className="controller-join__eyebrow">ペンライトコントローラー</p>
        <h1 className="controller-join__title">部屋に参加</h1>
        <p className="controller-join__hint">
          会場スクリーンに表示された4桁のコードを入力してください
        </p>
        <form className="controller-join__form" onSubmit={handleSubmit}>
          <input
            className="controller-join__input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="0000"
            maxLength={4}
            autoFocus
            value={code}
            // 数字以外の入力(記号・絵文字など)は無視して4桁に制限する
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
            aria-label="ルームコード"
          />
          <Button type="submit" disabled={!valid}>
            参加する
          </Button>
        </form>
      </Panel>
    </div>
  );
}
