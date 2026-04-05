#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT || "9391");
const PAGE_URL =
  process.env.EDUKE_PAGE_URL || "http://[::1]:4173/vendor/eduke32/launch.html";
const OUT_DIR = process.env.EDUKE_PROBE_OUT_DIR || process.cwd();
const PREFIX = process.env.EDUKE_PROBE_PREFIX || "tmp-headed";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CdpClient {
  #nextId = 1;
  #pending = new Map();

  constructor(webSocketUrl) {
    this.ws = new WebSocket(webSocketUrl);
    this.ws.addEventListener("message", async (event) => {
      let rawData = event.data;
      if (typeof rawData !== "string") {
        if (typeof rawData?.text === "function") {
          rawData = await rawData.text();
        } else if (typeof rawData?.arrayBuffer === "function") {
          rawData = Buffer.from(await rawData.arrayBuffer()).toString("utf8");
        } else {
          rawData = String(rawData);
        }
      }

      const msg = JSON.parse(rawData);
      if (!msg.id || !this.#pending.has(msg.id)) {
        return;
      }

      const pending = this.#pending.get(msg.id);
      this.#pending.delete(msg.id);
      clearTimeout(pending.timeout);

      if (msg.error) {
        pending.reject(new Error(`${pending.method}: ${JSON.stringify(msg.error)}`));
        return;
      }

      pending.resolve(msg.result ?? {});
    });
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve(), { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
  }

  async send(method, params = {}, sessionId = undefined) {
    const id = this.#nextId++;
    const payload = JSON.stringify({
      id,
      method,
      params,
      ...(sessionId ? { sessionId } : {}),
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${method}: timed out`));
      }, 15000);

      this.#pending.set(id, { method, resolve, reject, timeout });
      this.ws.send(payload);
    });
  }

  close() {
    this.ws.close();
  }
}

async function getPageTarget() {
  const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  if (!response.ok) {
    throw new Error(`failed to query Chrome targets on port ${DEBUG_PORT}`);
  }

  const targets = await response.json();
  const page = targets.find((target) => target.type === "page" && target.url === PAGE_URL);
  if (!page) {
    throw new Error(`page target not found for ${PAGE_URL}`);
  }

  return page;
}

async function getBrowserWebSocketUrl() {
  const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  if (!response.ok) {
    throw new Error(`failed to query Chrome browser endpoint on port ${DEBUG_PORT}`);
  }

  const version = await response.json();
  return version.webSocketDebuggerUrl;
}

async function evalExpr(cdp, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
    },
    cdp.sessionId,
  );

  return result.result?.value;
}

async function captureState(cdp, label) {
  const screenshot = await cdp.send(
    "Page.captureScreenshot",
    { format: "png" },
    cdp.sessionId,
  );
  const screenshotPath = path.join(OUT_DIR, `${PREFIX}-${label}.png`);
  await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

  const state = await evalExpr(
    cdp,
    `(() => {
      const canvas = document.getElementById("canvas");
      const rect = canvas.getBoundingClientRect();
      return {
        title: document.title,
        ready: document.body.dataset.ready || "",
        status: document.getElementById("status")?.textContent || "",
        pointerLocked: document.pointerLockElement === canvas,
        activeTag: document.activeElement?.tagName || "",
        probeKeys: window.__edukeProbeKeyEvents || [],
        logTail: (document.getElementById("output")?.value || "").split("\\n").slice(-12),
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      };
    })()`,
  );

  const jsonPath = path.join(OUT_DIR, `${PREFIX}-${label}.json`);
  await fs.writeFile(jsonPath, `${JSON.stringify(state, null, 2)}\n`);

  return state;
}

function getCanvasCenter(rect) {
  return {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
  };
}

async function mouseClick(cdp, x, y) {
  await cdp.send(
    "Input.dispatchMouseEvent",
    {
      type: "mouseMoved",
      x,
      y,
      button: "none",
    },
    cdp.sessionId,
  );
  await cdp.send(
    "Input.dispatchMouseEvent",
    {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    },
    cdp.sessionId,
  );
  await cdp.send(
    "Input.dispatchMouseEvent",
    {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    },
    cdp.sessionId,
  );
}

async function holdKey(cdp, keyDef, holdMs) {
  await evalExpr(
    cdp,
    `window.__edukeProbeDispatchKey("keydown", ${JSON.stringify(keyDef)})`,
  );
  await sleep(holdMs);
  await evalExpr(
    cdp,
    `window.__edukeProbeDispatchKey("keyup", ${JSON.stringify(keyDef)})`,
  );
}

async function moveMouse(cdp, from, to, steps = 16) {
  for (let i = 1; i <= steps; i++) {
    await cdp.send(
      "Input.dispatchMouseEvent",
      {
        type: "mouseMoved",
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
        button: "none",
      },
      cdp.sessionId,
    );
    await sleep(16);
  }
}

async function waitForGame(cdp) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const state = await evalExpr(
      cdp,
      `(() => ({
        title: document.title,
        ready: document.body.dataset.ready || "",
        status: document.getElementById("status")?.textContent || ""
      }))()`,
    );

    if (
      state.ready === "true" ||
      /WEB |Duke Nukem|HOLLYWOOD HOLOCAUST/.test(state.title)
    ) {
      return state;
    }

    await sleep(250);
  }

  throw new Error("game never reached a ready/running browser state");
}

async function main() {
  const page = await getPageTarget();
  const browserWsUrl = await getBrowserWebSocketUrl();
  const cdp = new CdpClient(browserWsUrl);
  await cdp.open();

  const attached = await cdp.send("Target.attachToTarget", {
    targetId: page.id,
    flatten: true,
  });
  cdp.sessionId = attached.sessionId;

  await cdp.send("Page.enable", {}, cdp.sessionId);
  await cdp.send("Runtime.enable", {}, cdp.sessionId);
  await cdp.send("DOM.enable", {}, cdp.sessionId);
  await cdp.send("Page.bringToFront", {}, cdp.sessionId);
  await evalExpr(
    cdp,
    `(() => {
      window.__edukeProbeKeyEvents = [];
      window.__edukeProbeDispatchKey = (type, init) => {
        const eventInit = {
          key: init.key,
          code: init.code,
          keyCode: init.keyCode,
          which: init.keyCode,
          charCode: init.text ? init.text.charCodeAt(0) : 0,
          bubbles: true,
          cancelable: true,
          composed: true
        };
        const targets = [
          window,
          document,
          document.activeElement,
          document.getElementById("canvas")
        ].filter(Boolean);

        for (const target of [...new Set(targets)]) {
          target.dispatchEvent(new KeyboardEvent(type, eventInit));
        }
      };
      for (const type of ["keydown", "keypress", "keyup"]) {
        document.addEventListener(type, (event) => {
          window.__edukeProbeKeyEvents.push({
            type,
            key: event.key,
            code: event.code,
            target: event.target?.tagName || ""
          });
          if (window.__edukeProbeKeyEvents.length > 24) {
            window.__edukeProbeKeyEvents.shift();
          }
        }, true);
      }
    })()`,
  );

  await waitForGame(cdp);
  let baseline = await captureState(cdp, "before");
  let center = getCanvasCenter(baseline.rect);

  await evalExpr(cdp, `document.getElementById("canvas")?.focus()`);
  await mouseClick(cdp, center.x, center.y);
  await sleep(500);
  const focused = await captureState(cdp, "focused");

  center = getCanvasCenter(focused.rect);

  await holdKey(cdp, { key: "ArrowUp", code: "ArrowUp", keyCode: 38 }, 1200);
  await sleep(300);
  const moved = await captureState(cdp, "move");

  await holdKey(cdp, { key: "ArrowRight", code: "ArrowRight", keyCode: 39 }, 900);
  await sleep(300);
  const turned = await captureState(cdp, "turn");

  await holdKey(cdp, { key: "Control", code: "ControlLeft", keyCode: 17 }, 150);
  await sleep(250);
  const fired = await captureState(cdp, "fire");

  await moveMouse(
    cdp,
    center,
    { x: center.x + 180, y: center.y },
    20,
  );
  await sleep(300);
  const mouseTurn = await captureState(cdp, "mouse-turn");

  const summary = { baseline, focused, moved, turned, fired, mouseTurn };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  cdp.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
