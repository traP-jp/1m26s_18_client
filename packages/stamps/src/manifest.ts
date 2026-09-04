// scripts/stamps.mjs が生成するファイル。手で編集しないこと。
// 配列の添字がそのままワイヤ上の stamp id (u8) になる。
import type { Stamp } from "./types";

import stamp0 from "../assets/00-thumbsup.svg";
import stamp1 from "../assets/01-clap.svg";
import stamp2 from "../assets/02-heart.svg";
import stamp3 from "../assets/03-tada.svg";
import stamp4 from "../assets/04-fire.svg";
import stamp5 from "../assets/05-sparkles.svg";
import stamp6 from "../assets/06-miku_ehehe.png";
import stamp7 from "../assets/07-balloon.svg";

export const STAMPS: readonly Stamp[] = [
  { id: 0, name: "thumbsup", traqId: "269095e6-c71c-4887-afb0-e42b5e2ac73b", src: stamp0 },
  { id: 1, name: "clap", traqId: "027fa329-1b7c-41c3-8b80-665facbdf4aa", src: stamp1 },
  { id: 2, name: "heart", traqId: "0baeaad6-dcf1-4fa2-9e16-3ee9b9622f1b", src: stamp2 },
  { id: 3, name: "tada", traqId: "8bfd4032-18d1-477f-894c-08855b46fd2f", src: stamp3 },
  { id: 4, name: "fire", traqId: "7b83bedb-3927-4300-9231-d210828b3087", src: stamp4 },
  { id: 5, name: "sparkles", traqId: "c80ebaaf-2154-4d96-a4c6-d37aa3331230", src: stamp5 },
  { id: 6, name: "miku_ehehe", traqId: "b68c5357-0178-4781-aece-7dad3ce21d3f", src: stamp6 },
  { id: 7, name: "balloon", traqId: "e992f961-e545-4b19-acfc-94f35b8bb175", src: stamp7 },
];
