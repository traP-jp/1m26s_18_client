import { useState } from "react";
import { Button, Panel, RoomJoinCard } from "ui";
import { mockSong, mockRoomCode, mockJoinUrl } from "../mockData";

export interface UrlInputScreenProps {
  onNext: () => void;
}

export function UrlInputScreen({ onNext }: UrlInputScreenProps) {
  const [url, setUrl] = useState("");
  const [fetched, setFetched] = useState(false);

  return (
    <div className="viewer-url-input">
      <Panel className="viewer-url-input__card" glow={fetched}>
        <p className="viewer-eyebrow">マジカルミライ プログラミング・コンテスト</p>
        <h1 className="viewer-title">楽曲URLを入力</h1>
        <p className="viewer-subtitle">
          TextAlive対応の楽曲URLを入力してセッションを作成します
        </p>

        <form
          className="viewer-url-input__form"
          onSubmit={(e) => {
            e.preventDefault();
            setFetched(true);
          }}
        >
          <input
            className="viewer-url-input__field"
            type="url"
            placeholder="https://songle.jp/songs/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button type="submit">曲情報を取得</Button>
        </form>

        {fetched && (
          <div className="viewer-url-input__result">
            <div className="viewer-song-card">
              <div className="viewer-song-card__thumb" aria-hidden="true" />
              <div className="viewer-song-card__meta">
                <span className="viewer-song-card__title">{mockSong.title}</span>
                <span className="viewer-song-card__artist">{mockSong.artist}</span>
              </div>
            </div>

            <RoomJoinCard roomCode={mockRoomCode} joinUrl={mockJoinUrl} />

            <Button onClick={onNext}>ロビーへ進む</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
