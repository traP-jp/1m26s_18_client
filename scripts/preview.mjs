#!/usr/bin/env node
import { execFile } from "node:child_process";

const APPS = {
  viewer: {
    port: 5173,
    screens: {
      "url-input": "/",
      lobby: "/room/0000/lobby",
      live: "/room/0000/live",
      "motion-test": "/motion-test",
    },
  },
  controller: {
    port: 5174,
    screens: {
      join: "/",
      calibration: "/room/0000",
      controller: "/room/0000/controller",
    },
  },
};

function printUsage() {
  console.log("Usage: npm run preview -- <app> <screen>");
  console.log("");
  for (const [app, cfg] of Object.entries(APPS)) {
    console.log(`  ${app}: ${Object.keys(cfg.screens).join(" | ")}`);
  }
  console.log("");
  console.log("Example: npm run preview -- viewer live");
}

const [, , appArg, screenArg] = process.argv;
const cfg = APPS[appArg];

if (!cfg || !screenArg || !(screenArg in cfg.screens)) {
  printUsage();
  process.exit(1);
}

const url = `http://localhost:${cfg.port}${cfg.screens[screenArg]}`;

try {
  const res = await fetch(`http://localhost:${cfg.port}/`, { signal: AbortSignal.timeout(1500) });
  if (!res.ok) throw new Error(`status ${res.status}`);
} catch {
  console.error(`${appArg} dev server isn't responding on port ${cfg.port}.`);
  console.error(`Start it first: npm run dev:${appArg}`);
  process.exit(1);
}

const openCommand =
  process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";

execFile(openCommand, [url], (err) => {
  if (err) {
    console.log(`Couldn't auto-open a browser. Open manually: ${url}`);
  } else {
    console.log(`Opened ${url}`);
  }
});
