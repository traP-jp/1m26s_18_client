export interface ContestSong {
  title: string;
  artist: string;
  url: string;
}

// マジカルミライ2026 プログラミング・コンテストの対象楽曲
export const CONTEST_SONGS: ContestSong[] = [
  { title: "こたえて", artist: "imie", url: "https://piapro.jp/t/6W2N/20251215164617" },
  { title: "アフター・ザ・カーテン", artist: "Rulmry", url: "https://piapro.jp/t/zoqO/20251214200738" },
  { title: "シャッターチャンス", artist: "夜未アガリ", url: "https://piapro.jp/t/PNpQ/20251209170719" },
  { title: "世界最後の音楽隊", artist: "夏山よつぎ×ど～ぱみん", url: "https://piapro.jp/t/B3yJ/20251215061727" },
  { title: "トリツクロジー", artist: "鶴三", url: "https://piapro.jp/t/QBdL/20251215094303" },
  { title: "TAKEOVER", artist: "Twinfield", url: "https://piapro.jp/t/E2i3/20251215092113" },
  { title: "君とリスタート！", artist: "masataro", url: "https://songle.jp/uploads/da7vv4bovtelekcf8300.mp3" },
];
