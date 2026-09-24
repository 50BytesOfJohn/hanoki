import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

if (process.platform !== "linux") {
  throw new Error("The Linux smoke test must run on Linux.");
}

const executable = path.resolve(`out/Hanoki-linux-${process.arch}/hanoki`);
assert.ok(existsSync(executable), `Missing packaged Linux app: ${executable}`);
assert.ok(existsSync(path.join(path.dirname(executable), "resources/icon.png")));

const profile = mkdtempSync(path.join(tmpdir(), "hanoki-linux-smoke-"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));

const appProcess = spawn(executable, ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"], {
  env: {
    ...process.env,
    HANOKI_DEBUG_CDP: String(port),
    HANOKI_USER_DATA_DIR: profile,
  },
  stdio: ["ignore", "ignore", "pipe"],
});
let appStderr = "";
appProcess.stderr.on("data", (chunk) => {
  appStderr = (appStderr + chunk.toString()).slice(-8_000);
});

let socket;
try {
  let page;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (appProcess.exitCode !== null) throw new Error("The packaged app exited during startup.");
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page = pages.find(
        (candidate) => candidate.type === "page" && candidate.url.includes("index.html"),
      );
      if (page) break;
    } catch {
      // Electron opens the debugging port after its main process starts.
    }
    await delay(500);
  }
  assert.ok(page, "The packaged renderer did not open within 30 seconds.");

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const requests = new Map();
  const exceptions = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(message.params.exceptionDetails.text);
    }
    if (!message.id) return;
    const request = requests.get(message.id);
    if (!request) return;
    requests.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      requests.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    }
    return result.result.value;
  };

  await send("Runtime.enable");
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    ready = await evaluate('!!document.querySelector("[data-slot=window-chrome]")');
    if (ready) break;
    await delay(500);
  }
  assert.ok(ready, "The packaged renderer did not render within 20 seconds.");

  const chat = await evaluate(`(async () => ({
    platform: window.electronAPI.platform,
    spacer: getComputedStyle(document.querySelector('[data-slot="window-chrome"]'))
      .getPropertyValue('--window-traffic-lights-spacer').trim(),
    searchShortcut: document.body.innerText.includes('Ctrl+K'),
    settingsButton: !!document.querySelector('[aria-label="Settings"]'),
    aiServer: (await window.electronAPI.getSystemState()).aiServer.status,
  }))()`);
  assert.equal(chat.platform, "linux");
  assert.equal(chat.spacer, "0px");
  assert.equal(chat.searchShortcut, true);
  assert.equal(chat.settingsButton, true);
  assert.equal(chat.aiServer, "ready");

  const command = "printf 'HANOKI_%s_%s\\n' LINUX PTY_OK\r";
  const terminal = await evaluate(`(async () => {
    const api = window.electronAPI;
    const workspace = await api.getActiveWorkspace();
    const item = await api.createTerminal(workspace.id, 'Linux smoke test', null);
    await api.startTerminal(item.id);
    await api.writeTerminal(item.id, ${JSON.stringify(command)});
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const session = await api.startTerminal(item.id);
      if (session.scrollback.includes('HANOKI_LINUX_PTY_OK')) return session.status;
    }
    throw new Error('The Linux pseudoterminal did not execute the command.');
  })()`);
  assert.equal(terminal, "running");

  await evaluate("document.querySelector('[aria-label=\"Settings\"]').click()");
  let settings = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    settings = await evaluate(
      'document.querySelector("[data-slot=window-chrome-toolbar]")?.innerText.includes("Settings")',
    );
    if (settings) break;
    await delay(250);
  }
  assert.equal(settings, true);
  assert.deepEqual(exceptions, []);
  console.log("Linux packaged app: chat, settings, AI server, and pseudoterminal passed.");
} catch (error) {
  console.error(appStderr);
  throw error;
} finally {
  socket?.close();
  appProcess.kill("SIGTERM");
  for (let attempt = 0; attempt < 20 && appProcess.exitCode === null; attempt++) {
    await delay(250);
  }
  if (appProcess.exitCode === null) appProcess.kill("SIGKILL");
  rmSync(profile, { recursive: true, force: true });
}
