import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Panel } from "ui";
import { fetchSongData, estimateBpm } from "../api/songs";
import type { SongData } from "../api/songs";

export interface UrlInputScreenProps {
  onNext: (song: SongData, bpm: number | null) => void;
}

type Status = "idle" | "loading" | "error";

export function UrlInputScreen({ onNext }: UrlInputScreenProps) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [song, setSong] = useState<SongData | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");
    try {
      const data = await fetchSongData(url);
      setSong(data);
      setStatus("idle");
    } catch (err) {
      setSong(null);
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "取得に失敗しました");
    }
  };

  const title = song?.type === "complete" ? song.title : "タイトル未登録の楽曲";
  const artist = song?.type === "complete" ? song.artist : "-";

  return (
    <div className="viewer-url-input">
      <Panel className="viewer-url-input__card" glow={!!song}>
        <p className="viewer-eyebrow">マジカルミライ プログラミング・コンテスト</p>
        <h1 className="viewer-title">楽曲URLを入力</h1>
        <p className="viewer-subtitle">
          TextAlive対応の楽曲URLを入力してセッションを作成します
        </p>

        <form className="viewer-url-input__form" onSubmit={handleSubmit}>
          <input
            className="viewer-url-input__field"
            type="url"
            placeholder="https://www.youtube.com/watch?v=... / https://www.nicovideo.jp/watch/sm..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button type="submit" disabled={status === "loading"}>
            {status === "loading" ? "取得中…" : "曲情報を取得"}
          </Button>
        </form>

        {status === "error" && <p className="viewer-url-input__error">{errorMessage}</p>}

        {song && (
          <div className="viewer-url-input__result">
            <div className="viewer-song-card">
              <div className="viewer-song-card__thumb" aria-hidden="true" />
              <div className="viewer-song-card__meta">
                <span className="viewer-song-card__title">{title}</span>
                <span className="viewer-song-card__artist">{artist}</span>
              </div>
            </div>

            <Button onClick={() => onNext(song, estimateBpm(song.beats))}>
              ロビーへ進む
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
