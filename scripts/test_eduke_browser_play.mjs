#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";

const CHROME_BIN =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const HEADLESS = process.env.CHROME_HEADLESS === "1";
const PAGE_URL =
  process.env.EDUKE_PAGE_URL || "http://[::1]:4173/vendor/eduke32/launch.html?autotest=1";
const OUT_DIR =
  process.env.EDUKE_TEST_OUT_DIR || "/Users/gguthrie/Desktop/pixelart/build/browser";
const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT || "9417");
const VIEWPORT = { width: 1280, height: 960 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CdpClient {
  #nextId = 1;
  #pending = new Map();
  #eventWaiters = [];
  observedEvents = [];

  constructor(webSocketUrl) {
    this.ws = new WebSocket(webSocketUrl);
    this.sessionId = undefined;

    this.ws.addEventListener("message", async (event) => {
      let raw = event.data;
      if (typeof raw !== "string") {
        if (typeof raw?.text === "function") {
          raw = await raw.text();
        } else if (typeof raw?.arrayBuffer === "function") {
          raw = Buffer.from(await raw.arrayBuffer()).toString("utf8");
        } else {
          raw = String(raw);
        }
      }

      const msg = JSON.parse(raw);

      if (msg.id && this.#pending.has(msg.id)) {
        const pending = this.#pending.get(msg.id);
        this.#pending.delete(msg.id);
        clearTimeout(pending.timeout);

        if (msg.error) {
          pending.reject(new Error(`${pending.method}: ${JSON.stringify(msg.error)}`));
        } else {
          pending.resolve(msg.result ?? {});
        }
        return;
      }

      if (!msg.method) {
        return;
      }

      if (
        msg.method === "Runtime.consoleAPICalled" ||
        msg.method === "Runtime.exceptionThrown" ||
        msg.method === "Log.entryAdded" ||
        msg.method === "Inspector.targetCrashed" ||
        msg.method === "Target.targetCrashed"
      ) {
        this.observedEvents.push(msg);
        if (this.observedEvents.length > 2048) {
          this.observedEvents.shift();
        }
      }

      for (const waiter of [...this.#eventWaiters]) {
        if (!waiter.predicate(msg)) {
          continue;
        }

        clearTimeout(waiter.timeout);
        this.#eventWaiters = this.#eventWaiters.filter((item) => item !== waiter);
        waiter.resolve(msg);
      }
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

  async waitForEvent(predicate, timeoutMs, label) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#eventWaiters = this.#eventWaiters.filter((item) => item !== waiter);
        reject(new Error(`${label}: timed out`));
      }, timeoutMs);

      const waiter = { predicate, resolve, reject, timeout };
      this.#eventWaiters.push(waiter);
    });
  }

  close() {
    this.ws.close();
  }
}

async function waitForHttpJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // ignore and retry
    }
    await sleep(100);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function waitFor(label, predicate, timeoutMs = 10000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) {
      return result;
    }
    await sleep(intervalMs);
  }

  throw new Error(`${label}: timed out`);
}

function consoleValues(msg) {
  return ((msg.params || {}).args || []).map((arg) => arg.value).filter(Boolean);
}

async function launchChrome() {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "eduke-browser-test-"));
  const args = [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--mute-audio",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    "about:blank",
  ];

  if (HEADLESS) {
    args.unshift("--use-angle=swiftshader");
    args.unshift("--disable-gpu");
    args.unshift("--headless=new");
  } else {
    args.unshift("--new-window");
  }

  const proc = spawn(CHROME_BIN, args, {
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const version = await waitForHttpJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 15000);
  return { proc, userDataDir, version, getStderr: () => stderr };
}

async function attachTarget(cdp) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });

  cdp.sessionId = sessionId;

    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Log.enable", {}, sessionId);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: 1,
      mobile: false,
    },
    sessionId,
  );
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

  if (result.exceptionDetails) {
    throw new Error(`Runtime.evaluate exception: ${result.exceptionDetails.text || expression}`);
  }

  return result.result?.value;
}

async function navigateToGame(cdp) {
  const loadEvent = cdp.waitForEvent(
    (msg) => msg.sessionId === cdp.sessionId && msg.method === "Page.loadEventFired",
    20000,
    "Page.loadEventFired",
  );

  await cdp.send("Page.navigate", { url: PAGE_URL }, cdp.sessionId);
  await loadEvent;
}

async function installDomHelpers(cdp) {
  await evalExpr(
    cdp,
    `(() => {
      globalThis.__edukeDomEvents = [];
      const record = (type, event) => {
        globalThis.__edukeDomEvents.push({
          type,
          key: event.key || "",
          code: event.code || "",
          button: event.button ?? -1,
          buttons: event.buttons ?? 0,
          target: event.target?.tagName || "",
        });
        if (globalThis.__edukeDomEvents.length > 96) {
          globalThis.__edukeDomEvents.shift();
        }
      };

      for (const type of ["keydown", "keyup", "mousedown", "mouseup", "mousemove"]) {
        document.addEventListener(type, (event) => record(type, event), true);
      }

      globalThis.__edukeDispatchDomKey = (type, init) => {
        const eventInit = {
          key: init.key,
          code: init.code,
          keyCode: init.keyCode,
          which: init.keyCode,
          bubbles: true,
          cancelable: true,
          composed: true,
        };
        const targets = [window, document, document.body, document.activeElement, document.getElementById("canvas")]
          .filter(Boolean);
        for (const target of [...new Set(targets)]) {
          target.dispatchEvent(new KeyboardEvent(type, eventInit));
        }
      };
    })()`,
  );
}

async function getSnapshot(cdp) {
  return await evalExpr(
    cdp,
    `(() => {
      const canvas = document.getElementById("canvas");
      const domRect = canvas ? canvas.getBoundingClientRect() : null;
      const rect = domRect ? {
        x: domRect.x,
        y: domRect.y,
        width: domRect.width,
        height: domRect.height
      } : { x: 0, y: 0, width: 0, height: 0 };
      const pads = {};
      for (const element of document.querySelectorAll("[data-gamefunc]")) {
        const r = element.getBoundingClientRect();
        pads[element.dataset.gamefunc] = {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height
        };
      }
      return {
        title: document.title,
        activeTag: document.activeElement?.tagName || "",
        hasFocus: document.hasFocus(),
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        rect,
        pads,
        sdlMouse: globalThis.__edukeHost?.sdlMouse || globalThis.__edukeSdlMouse || null,
        cacheProgress: globalThis.__edukeHost?.cacheProgress || globalThis.__edukeCacheProgress || null,
        tileLoad: globalThis.__edukeHost?.tileLoad || globalThis.__edukeTileLoad || null,
        drawProgress: globalThis.__edukeHost?.drawProgress || globalThis.__edukeDrawProgress || null,
        state: globalThis.__edukeHost?.state || globalThis.__edukeState || null,
        submitted: globalThis.__edukeHost?.submittedInput || globalThis.__edukeSubmittedInput || null,
      };
    })()`,
  );
}

async function captureScreenshot(cdp, filePath) {
  const screenshot = await cdp.send(
    "Page.captureScreenshot",
    { format: "png" },
    cdp.sessionId,
  );
  await writeFile(filePath, Buffer.from(screenshot.data, "base64"));
}

async function tryCaptureScreenshot(cdp, filePath) {
  try {
    await captureScreenshot(cdp, filePath);
  } catch {
    // Non-fatal: screenshot capture is useful for debugging but not part of the playability assertion.
  }
}

function getCanvasCenter(snapshot) {
  return {
    x: Math.round(snapshot.rect.x + snapshot.rect.width / 2),
    y: Math.round(snapshot.rect.y + snapshot.rect.height / 2),
  };
}

function getPadRect(snapshot, gamefunc) {
  const direct = snapshot.pads?.[String(gamefunc)];
  if (direct) {
    return direct;
  }

  const width = 84;
  const height = 42;
  const gap = 8;
  const right = 16;
  const bottom = 16;
  const totalWidth = width * 3 + gap * 2;
  const startX = (snapshot.innerWidth || 1280) - right - totalWidth;
  const y = (snapshot.innerHeight || 960) - bottom - height;
  const indexByFunc = { 0: 0, 3: 1, 5: 2 };
  const index = indexByFunc[gamefunc];
  if (index === undefined) {
    return null;
  }
  return {
    x: startX + index * (width + gap),
    y,
    width,
    height,
  };
}

async function mouseClick(cdp, point) {
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseMoved", x: point.x, y: point.y, button: "none" },
    cdp.sessionId,
  );
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 },
    cdp.sessionId,
  );
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1 },
    cdp.sessionId,
  );
}

function positionDistance(before, after) {
  const dx = (after.x || 0) - (before.x || 0);
  const dy = (after.y || 0) - (before.y || 0);
  return Math.hypot(dx, dy);
}

function angleDelta(before, after) {
  const raw = ((after - before + 1024) % 2048) - 1024;
  return Math.abs(raw);
}

async function waitForGameState(cdp) {
  await cdp.waitForEvent((msg) => {
    if (msg.method !== "Runtime.consoleAPICalled") {
      return false;
    }
    return consoleValues(msg).some((value) => typeof value === "string" && value.includes("E1L1: HOLLYWOOD HOLOCAUST"));
  }, 60000, "autotest startup");
}

function getAutotestSamples(cdp) {
  const samples = [];
  for (const event of cdp.observedEvents) {
    if (event.method !== "Runtime.consoleAPICalled") {
      continue;
    }
    const values = (event.params?.args || []).map((arg) => arg.value).filter(Boolean);
    if (values.length < 2 || values[0] !== "EDUKE_AUTOTEST") {
      continue;
    }
    try {
      samples.push(JSON.parse(values[1]));
    } catch {
      // ignore malformed samples
    }
  }
  return samples;
}

function getAutotestResult(cdp) {
  for (const event of cdp.observedEvents) {
    const vals = consoleValues(event);
    if (vals[0] === "EDUKE_AUTOTEST_RESULT" && vals[1]) {
      try {
        return JSON.parse(vals[1]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  let browser;
  let cdp;
  let currentStep = "start";
  try {
    const mark = (step) => {
      currentStep = step;
      process.stdout.write(`[test] ${step}\n`);
    };

    mark("launch-browser");
    browser = await launchChrome();
    cdp = new CdpClient(browser.version.webSocketDebuggerUrl);
    await cdp.open();
    mark("attach-target");
    await attachTarget(cdp);
    mark("navigate");
    await navigateToGame(cdp);
    mark("install-helpers");
    await installDomHelpers(cdp);

    mark("wait-game-state");
    await waitForGameState(cdp);

    mark("wait-autotest-result");
    const resultEvent = await cdp.waitForEvent((msg) => {
      if (msg.method !== "Runtime.consoleAPICalled") {
        return false;
      }
      const vals = consoleValues(msg);
      return vals[0] === "EDUKE_AUTOTEST_RESULT" && !!vals[1];
    }, 30000, "EDUKE_AUTOTEST_RESULT");
    const result = JSON.parse(consoleValues(resultEvent)[1]);

    mark("write-summary");
    const summary = result;

    await writeFile(
      path.join(OUT_DIR, "test-play-summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
    );

    if (!result.assertions?.movedEnough || !result.assertions?.turnedEnough || !result.assertions?.firedEnough) {
      throw new Error(`Play test failed: ${JSON.stringify(summary, null, 2)}`);
    }

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } catch (error) {
    if (cdp) {
      const fallbackErrorState = {
        error: `${String(error)} @ ${currentStep}`,
        observedEvents: cdp.observedEvents,
      };

      try {
        await writeFile(
          path.join(OUT_DIR, "test-play-error-state.json"),
          `${JSON.stringify(fallbackErrorState, null, 2)}\n`,
        );
      } catch {
        try {
          await writeFile(
            path.join(OUT_DIR, "test-play-error-state.json"),
            `${JSON.stringify(fallbackErrorState, null, 2)}\n`,
          );
        } catch {
          // ignore secondary failures
        }
      }
    }

    throw error;
  } finally {
    if (cdp) {
      cdp.close();
    }
    if (browser?.proc && !browser.proc.killed) {
      browser.proc.kill("SIGKILL");
      try {
        await once(browser.proc, "exit");
      } catch {
        // ignore
      }
    }
    if (browser?.userDataDir) {
      await sleep(250);
      await rm(browser.userDataDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
