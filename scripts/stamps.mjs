// traQ のスタンプを packages/stamps に取り込むための CLI。
//
//   npm run stamps -- search <キーワード>     traQ 上のスタンプを名前の部分一致で探す
//   npm run stamps -- add <名前|UUID>...       設定に追加して画像を取得し直す
//   npm run stamps -- remove <名前|UUID>...    設定から外して画像を取得し直す
//   npm run stamps -- list                     設定済みのスタンプと stamp id を表示
//   npm run stamps -- fetch                    設定どおりに画像を取得し直す (npm run stamps:fetch と同じ)
//
// 認証情報はリポジトリ直下の .env (.env.example 参照) から読む。
// 取得するスタンプは packages/stamps/stamps.config.json に列挙する
// (traQ のスタンプ名、または UUID)。配列の順番がそのままワイヤ上の
// stamp id (u8, 0 始まり) になるので、並び替え・削除で後続の id が変わることに注意。
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_DIR = path.join(ROOT, "packages", "stamps");
const ASSETS_DIR = path.join(PACKAGE_DIR, "assets");
const MANIFEST_PATH = path.join(PACKAGE_DIR, "src", "manifest.ts");
const CONFIG_PATH = path.join(PACKAGE_DIR, "stamps.config.json");
const ENV_PATH = path.join(ROOT, ".env");
const CONFIG_RELATIVE = path.relative(ROOT, CONFIG_PATH);

/** ワイヤ上の stamp id は u8 なので 256 個まで */
const MAX_STAMPS = 256;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXTENSION_BY_CONTENT_TYPE = {
  "image/png": "png",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const USAGE = `使い方:
  npm run stamps -- search <キーワード>     traQ 上のスタンプを名前の部分一致で探す
  npm run stamps -- add <名前|UUID>...       設定に追加して画像を取得し直す
  npm run stamps -- remove <名前|UUID>...    設定から外して画像を取得し直す
  npm run stamps -- list                     設定済みのスタンプと stamp id を表示
  npm run stamps -- fetch                    設定どおりに画像を取得し直す`;

// ---------------------------------------------------------------- 設定 / 環境

async function loadDotEnv(file) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // 実行環境の環境変数を優先する
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function loadConfig() {
  const raw = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  const stamps = Array.isArray(raw.stamps) ? raw.stamps.map(String) : [];
  return { raw, stamps };
}

function baseUrlOf(config) {
  // TRAQ_BASE_URL は動作確認用(モックサーバーなど)の上書き
  return String(process.env.TRAQ_BASE_URL ?? config.baseUrl ?? "https://q.trap.jp/api/v3").replace(
    /\/+$/,
    "",
  );
}

async function saveConfig(raw, stamps) {
  await writeFile(CONFIG_PATH, `${JSON.stringify({ ...raw, stamps }, null, 2)}\n`);
}

function validateEntries(stamps) {
  if (stamps.length === 0) {
    throw new Error(`${CONFIG_RELATIVE} の stamps が空です`);
  }
  if (stamps.length > MAX_STAMPS) {
    throw new Error(`スタンプは最大 ${MAX_STAMPS} 個までです (${stamps.length} 個指定されています)`);
  }
  const duplicates = stamps.filter((name, i) => stamps.indexOf(name) !== i);
  if (duplicates.length > 0) {
    throw new Error(`stamps に重複があります: ${[...new Set(duplicates)].join(", ")}`);
  }
}

// ---------------------------------------------------------------- traQ API

/**
 * traQ の認証ヘッダーを返す。
 * TRAQ_TOKEN があれば Bearer トークン、なければ TRAQ_USERNAME / TRAQ_PASSWORD で
 * /login してセッション Cookie を使う。
 */
async function authHeaders(baseUrl) {
  const token = process.env.TRAQ_TOKEN;
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  const name = process.env.TRAQ_USERNAME;
  const password = process.env.TRAQ_PASSWORD;
  if (!name || !password) {
    throw new Error(
      "traQ の認証情報がありません。.env に TRAQ_TOKEN か TRAQ_USERNAME / TRAQ_PASSWORD を設定してください (.env.example 参照)",
    );
  }
  const response = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
    redirect: "manual",
  });
  if (!response.ok) {
    throw new Error(`traQ へのログインに失敗しました: HTTP ${response.status}`);
  }
  const session = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .find((cookie) => cookie.startsWith("r_session="));
  if (!session) {
    throw new Error("traQ のログイン応答にセッション Cookie (r_session) がありません");
  }
  return { Cookie: session };
}

/** 認証済みの API クライアント(スタンプ一覧は初回だけ取得してキャッシュする) */
async function createClient(config) {
  const baseUrl = baseUrlOf(config);
  const headers = await authHeaders(baseUrl);
  let stampList = null;

  return {
    async stamps() {
      if (stampList === null) {
        const response = await fetch(`${baseUrl}/stamps`, { headers });
        if (!response.ok) {
          throw new Error(`スタンプ一覧の取得に失敗しました: HTTP ${response.status}`);
        }
        stampList = await response.json();
      }
      return stampList;
    },
    async image(traqId) {
      const response = await fetch(`${baseUrl}/stamps/${traqId}/image`, { headers });
      if (!response.ok) {
        throw new Error(`スタンプ画像の取得に失敗しました (${traqId}): HTTP ${response.status}`);
      }
      const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
      const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
      if (!extension) {
        throw new Error(`未対応の画像形式です (${traqId}): ${contentType || "不明"}`);
      }
      return { bytes: new Uint8Array(await response.arrayBuffer()), extension };
    },
  };
}

/** 設定の各エントリ(名前または UUID)を traQ 上のスタンプに解決する */
async function resolveStamps(client, entries) {
  const list = await client.stamps();
  const byName = new Map(list.map((stamp) => [stamp.name, stamp]));
  const byId = new Map(list.map((stamp) => [stamp.id.toLowerCase(), stamp]));
  const missing = [];
  const resolved = entries.map((entry) => {
    const stamp = UUID_PATTERN.test(entry) ? byId.get(entry.toLowerCase()) : byName.get(entry);
    if (!stamp) {
      missing.push(entry);
      return null;
    }
    return { name: stamp.name, traqId: stamp.id };
  });
  if (missing.length > 0) {
    throw new Error(`traQ に存在しないスタンプです: ${missing.join(", ")}`);
  }
  return resolved;
}

// ---------------------------------------------------------------- 生成

function safeFileStem(name) {
  return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

function renderManifest(stamps) {
  const lines = [
    "// scripts/stamps.mjs が生成するファイル。手で編集しないこと。",
    "// 配列の添字がそのままワイヤ上の stamp id (u8) になる。",
    'import type { Stamp } from "./types";',
    "",
  ];
  stamps.forEach((stamp, i) => {
    lines.push(`import stamp${i} from "../assets/${stamp.file}";`);
  });
  lines.push("", "export const STAMPS: readonly Stamp[] = [");
  stamps.forEach((stamp, i) => {
    lines.push(
      `  { id: ${i}, name: ${JSON.stringify(stamp.name)}, traqId: ${JSON.stringify(stamp.traqId)}, src: stamp${i} },`,
    );
  });
  lines.push("];", "");
  return lines.join("\n");
}

async function clearAssets() {
  await mkdir(ASSETS_DIR, { recursive: true });
  for (const entry of await readdir(ASSETS_DIR)) {
    if (entry.startsWith(".")) continue;
    await rm(path.join(ASSETS_DIR, entry));
  }
}

/** 設定どおりに画像を取得し、assets と manifest.ts を書き直す */
async function fetchAll(client, entries) {
  validateEntries(entries);
  const resolved = await resolveStamps(client, entries);

  // 画像は全件取得できてから書き出す(途中で失敗しても既存の状態を壊さない)
  const downloaded = [];
  for (const [i, stamp] of resolved.entries()) {
    const { bytes, extension } = await client.image(stamp.traqId);
    const file = `${String(i).padStart(2, "0")}-${safeFileStem(stamp.name)}.${extension}`;
    downloaded.push({ ...stamp, file, bytes });
    console.log(`[${i}] ${stamp.name} (${stamp.traqId}) -> ${file} (${bytes.byteLength} bytes)`);
  }

  await clearAssets();
  for (const stamp of downloaded) {
    await writeFile(path.join(ASSETS_DIR, stamp.file), stamp.bytes);
  }
  await writeFile(MANIFEST_PATH, renderManifest(downloaded));
  console.log(`${downloaded.length} 個のスタンプを ${path.relative(ROOT, ASSETS_DIR)} に保存しました`);
}

// ---------------------------------------------------------------- サブコマンド

async function commandFetch() {
  const { raw, stamps } = await loadConfig();
  const client = await createClient(raw);
  await fetchAll(client, stamps);
}

async function commandList() {
  const { stamps } = await loadConfig();
  if (stamps.length === 0) {
    console.log(`(設定済みのスタンプはありません: ${CONFIG_RELATIVE})`);
    return;
  }
  stamps.forEach((entry, i) => console.log(`[${i}] ${entry}`));
}

async function commandSearch(args) {
  const query = args.join(" ").trim().toLowerCase();
  if (!query) throw new Error("検索キーワードを指定してください");
  const { raw, stamps: configured } = await loadConfig();
  const client = await createClient(raw);
  const list = await client.stamps();
  const configuredSet = new Set(configured.map((entry) => entry.toLowerCase()));
  const hits = list
    .filter((stamp) => stamp.name.toLowerCase().includes(query))
    .sort((a, b) => {
      const ap = a.name.toLowerCase().startsWith(query) ? 0 : 1;
      const bp = b.name.toLowerCase().startsWith(query) ? 0 : 1;
      return ap - bp || a.name.localeCompare(b.name);
    });
  if (hits.length === 0) {
    console.log(`"${query}" に一致するスタンプはありません`);
    return;
  }
  for (const stamp of hits) {
    const added =
      configuredSet.has(stamp.name.toLowerCase()) || configuredSet.has(stamp.id.toLowerCase())
        ? " (設定済み)"
        : "";
    const type = stamp.isUnicode ? "unicode" : "original";
    console.log(`${stamp.name.padEnd(32)} ${stamp.id}  ${type}${added}`);
  }
  console.log(`\n${hits.length} 件。追加するには: npm run stamps -- add <名前>`);
}

async function commandAdd(args) {
  if (args.length === 0) throw new Error("追加するスタンプ名(または UUID)を指定してください");
  const { raw, stamps } = await loadConfig();
  const client = await createClient(raw);
  // 存在確認(名前の綴り違いで設定を壊さない)。UUID は正式な名前に置き換えて保存する
  const resolved = await resolveStamps(client, args);
  const next = [...stamps];
  const lowerNext = new Set(next.map((entry) => entry.toLowerCase()));
  for (const stamp of resolved) {
    if (lowerNext.has(stamp.name.toLowerCase()) || lowerNext.has(stamp.traqId.toLowerCase())) {
      console.log(`${stamp.name} は設定済みです`);
      continue;
    }
    next.push(stamp.name);
    lowerNext.add(stamp.name.toLowerCase());
    console.log(`${stamp.name} を追加します (stamp id: ${next.length - 1})`);
  }
  if (next.length === stamps.length) {
    console.log("設定に変更はありません");
    return;
  }
  validateEntries(next);
  await fetchAll(client, next);
  await saveConfig(raw, next);
  console.log(`${CONFIG_RELATIVE} を更新しました`);
}

async function commandRemove(args) {
  if (args.length === 0) throw new Error("削除するスタンプ名(または UUID)を指定してください");
  const { raw, stamps } = await loadConfig();
  const targets = new Set(args.map((entry) => entry.toLowerCase()));
  const next = stamps.filter((entry) => !targets.has(entry.toLowerCase()));
  const removed = stamps.filter((entry) => targets.has(entry.toLowerCase()));
  const notFound = args.filter((entry) => !stamps.some((s) => s.toLowerCase() === entry.toLowerCase()));
  if (notFound.length > 0) {
    console.log(`設定にないので無視します: ${notFound.join(", ")}`);
  }
  if (removed.length === 0) {
    console.log("設定に変更はありません");
    return;
  }
  console.log(`削除: ${removed.join(", ")}(後続の stamp id は詰められます)`);
  const client = await createClient(raw);
  if (next.length > 0) {
    await fetchAll(client, next);
  } else {
    await clearAssets();
    await writeFile(
      MANIFEST_PATH,
      [
        "// scripts/stamps.mjs が生成するファイル。手で編集しないこと。",
        "// スタンプ未取得の状態(空)。`npm run stamps:fetch` で更新される。",
        'import type { Stamp } from "./types";',
        "",
        "export const STAMPS: readonly Stamp[] = [];",
        "",
      ].join("\n"),
    );
    console.log("スタンプがなくなったので assets を空にしました");
  }
  await saveConfig(raw, next);
  console.log(`${CONFIG_RELATIVE} を更新しました`);
}

async function main(argv) {
  await loadDotEnv(ENV_PATH);
  const [command = "fetch", ...args] = argv;
  switch (command) {
    case "fetch":
      return commandFetch();
    case "list":
      return commandList();
    case "search":
      return commandSearch(args);
    case "add":
      return commandAdd(args);
    case "remove":
    case "rm":
      return commandRemove(args);
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      return;
    default:
      throw new Error(`不明なコマンドです: ${command}\n${USAGE}`);
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
