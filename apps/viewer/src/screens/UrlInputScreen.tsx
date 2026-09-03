import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "ui";
import { fetchSongData, estimateBpm } from "../api/songs";
import { createRoomForSong } from "../api/rooms";
import type { RoomInfo } from "../api/rooms";
import type { SongData } from "../api/songs";
import { CONTEST_SONGS } from "../contestSongs";

export interface UrlInputScreenProps {
  onNext: (song: SongData, bpm: number | null, songUrl: string, room: RoomInfo) => void;
}

type Status = "idle" | "loading";

export function UrlInputScreen({ onNext }: UrlInputScreenProps) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [song, setSong] = useState<SongData | null>(null);
  // 直近で取得に成功した曲のURL。songがこのURLと一致する間だけ「取得済み」として
  // 進行ボタンを有効化する — フェッチ中や、フェッチ後にURL欄だけ書き換えられた
  // 場合に、古い曲情報のまま次へ進めてしまうのを防ぐ。
  const [fetchedForUrl, setFetchedForUrl] = useState<string | null>(null);

  const loadSongUrl = async (candidateUrl: string) => {
    setUrl(candidateUrl);
    setSong(null);
    setFetchedForUrl(null);
    setStatus("loading");
    setErrorMessage("");
    try {
      const data = await fetchSongData(candidateUrl);
      setSong(data);
      setFetchedForUrl(candidateUrl);
      setStatus("idle");
    } catch (err) {
      setSong(null);
      setStatus("idle");
      setErrorMessage(err instanceof Error ? err.message : "取得に失敗しました");
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void loadSongUrl(url);
  };

  const handleUrlFieldChange = (next: string) => {
    setUrl(next);
    if (fetchedForUrl !== null && next !== fetchedForUrl) {
      setSong(null);
      setFetchedForUrl(null);
      setStatus("idle");
      setErrorMessage("");
    }
  };

  const isReady = status === "idle" && !!song && fetchedForUrl === url;
  const handleEnterLobby = async () => {
    if (!song || creating) return;
    setCreating(true);
    setErrorMessage("");
    try {
      const room = await createRoomForSong(url);
      onNext(song, estimateBpm(song.beats), url, room);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "部屋の作成に失敗しました");
    } finally {
      setCreating(false);
    }
  };
  const title = song?.type === "complete" ? song.title : "タイトル未登録の楽曲";
  const artist = song?.type === "complete" ? song.artist : "-";

  return (
    <div className="viewer-url-input">
      <div className="viewer-stage-ambience" aria-hidden="true">
        <div className="viewer-stage-ambience__glow viewer-stage-ambience__glow--warm" />
        <div className="viewer-stage-ambience__glow viewer-stage-ambience__glow--cool" />
        <div className="viewer-stage-ambience__beams" />
      </div>

      <div className="viewer-url-input__content">
        <header className="viewer-url-input__header">
          <p className="viewer-eyebrow">ライブ上映したい曲を選択してね！</p>
          <h1 className="viewer-stage-title">SET LIST</h1>
          <p className="viewer-subtitle">
            気になる曲をタップすると、自動で曲情報を取得します。
          </p>
        </header>

        <div className="viewer-setlist">
          {CONTEST_SONGS.map((contestSong, i) => {
            const isActive = isReady && fetchedForUrl === contestSong.url;
            const isPending = status === "loading" && url === contestSong.url;
            return (
              <button
                key={contestSong.url}
                type="button"
                className={`viewer-setlist__row${isActive ? " viewer-setlist__row--active" : ""}`}
                onClick={() => void loadSongUrl(contestSong.url)}
                disabled={status === "loading"}
              >
                <span className="viewer-setlist__number">{String(i + 1).padStart(2, "0")}</span>
                <span className="viewer-setlist__perforation" aria-hidden="true" />
                <span className="viewer-setlist__info">
                  <span className="viewer-setlist__title">{contestSong.title}</span>
                  <span className="viewer-setlist__artist">{contestSong.artist}</span>
                </span>
                <span className="viewer-setlist__status">
                  {isPending ? "取得中…" : isActive ? "選択中" : ""}
                </span>
              </button>
            );
          })}
        </div>

        <details className="viewer-url-input__manual">
          <summary>または、URLを直接入力する</summary>
          <a
            className="viewer-url-input__find-link"
            href="https://textalive.jp/songs"
            target="_blank"
            rel="noreferrer"
          >
            対応楽曲を探す(textalive.jp) ↗
          </a>
          <form className="viewer-url-input__form" onSubmit={handleSubmit}>
            <input
              className="viewer-url-input__field"
              type="url"
              placeholder="例: https://www.youtube.com/watch?v=xxxxxxxxxxx"
              value={url}
              onChange={(e) => handleUrlFieldChange(e.target.value)}
            />
            <Button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "取得中…" : "曲情報を取得"}
            </Button>
          </form>
          <p className="viewer-hint">
            YouTube またはニコニコ動画のURL(その楽曲がTextAlive/Songleに登録されている必要があります)
          </p>
        </details>

        {errorMessage && (
          <p className="viewer-url-input__error">
            {errorMessage}
            {" — "}
            <a href="https://textalive.jp/songs" target="_blank" rel="noreferrer">
              対応楽曲一覧を見る ↗
            </a>
          </p>
        )}

        {/* 下部に固定バーの分だけ余白を確保 */}
        <div className="viewer-stage-footer-spacer" aria-hidden="true" />
      </div>

      <div className="viewer-stage-ticket">
        <div className="viewer-stage-ticket__info">
          {status === "loading" && (
            <span className="viewer-stage-ticket__status">曲情報を取得中…</span>
          )}
          {isReady && (
            <div className="viewer-song-card">
              <div className="viewer-song-card__thumb" aria-hidden="true" />
              <div className="viewer-song-card__meta">
                <span className="viewer-song-card__title">{title}</span>
                <span className="viewer-song-card__artist">{artist}</span>
              </div>
            </div>
          )}
          {!isReady && status !== "loading" && (
            <span className="viewer-stage-ticket__status viewer-stage-ticket__status--muted">
              曲を選ぶとここに表示されます
            </span>
          )}
        </div>
        <Button disabled={!isReady || creating} onClick={() => void handleEnterLobby()}>
          {creating ? "部屋を作成中…" : "ロビーへ進む"}
        </Button>
      </div>
    </div>
  );
}
