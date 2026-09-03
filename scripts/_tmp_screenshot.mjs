import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 850 } });

const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto("http://localhost:5183/?screen=live", { waitUntil: "networkidle" });
await page.waitForTimeout(6500);

await page.screenshot({ path: "/private/tmp/claude-501/-Users-honndakaisei-26-1m/bc2427e6-143f-4079-8c36-7f1bf7d924e1/scratchpad/live-stage.png" });

console.log("=== CONSOLE LOGS ===");
console.log(logs.join("\n"));

await browser.close();
