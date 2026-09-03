import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Panel } from "ui";
import type { ParticipantRoomState } from "../api/useParticipantRoom";

export interface JoinScreenProps {
  /** QRコードなどで URL に部屋コードが含まれていた場合の初期値 */
  initialCode?: string;
  state: ParticipantRoomState;
  onJoin: (roomCode: string) => void;
}

const ROOM_CODE_PATTERN = /^[0-9]{4}$/;

export function JoinScreen({ initialCode = "", state, onJoin }: JoinScreenProps) {
  const [code, setCode] = useState(initialCode);
  const valid = ROOM_CODE_PATTERN.test(code);
  const busy = state.status === "connecting" || state.status === "connected";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    onJoin(code);
  };

  return (
    <div className="controller-join">
      <Panel className="controller-join__panel" glow>
        <p className="controller-join__eyebrow">ペンライトコントローラー</p>
        <h1 className="controller-join__title">部屋に参加</h1>
        {state.status === "connected" ? (
          <p className="controller-join__hint">参加しました!準備画面へ移動します…</p>
        ) : (
          <>
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
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 4))
                }
                aria-label="ルームコード"
              />
              <Button type="submit" disabled={!valid || busy}>
                {state.status === "connecting" ? "接続中…" : "参加する"}
              </Button>
            </form>
            {state.status === "error" && state.errorMessage && (
              <p className="controller-join__error">{state.errorMessage}</p>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
