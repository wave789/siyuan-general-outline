import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A small CDP pipe client keeps browser tests free of npm dependencies and open ports.
export async function launchBrowser() {
  const profile = await mkdtemp(join(tmpdir(), "sgo-chrome-"));
  const executable = process.env.CHROME_BIN || "google-chrome";
  const child = spawn(executable, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--ignore-certificate-errors",
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-component-update", "--disable-sync", "--disable-breakpad",
    "--remote-debugging-pipe", `--user-data-dir=${profile}`, "about:blank"
  ], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  let sequence = 0;
  let buffer = "";
  let stderr = "";
  const pending = new Map();
  const listeners = new Map();
  const exceptions = [];
  child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-6000); });
  function fail(error) {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  }
  child.on("error", fail);
  child.on("exit", code => fail(new Error(`Chrome exited (${code}). ${stderr}`)));
  for (const pipe of [child.stdio[3], child.stdio[4]]) {
    pipe.on("error", error => fail(new Error(`Chrome pipe failed: ${error.message}. ${stderr}`)));
  }
  child.stdio[4].setEncoding("utf8");
  child.stdio[4].on("data", chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\0")) !== -1) {
      const packet = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!packet) continue;
      const message = JSON.parse(packet);
      if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails);
      for (const handler of listeners.get(message.method) || []) {
        Promise.resolve(handler(message.params, message.sessionId)).catch(error => exceptions.push(String(error)));
      }
      const request = pending.get(message.id);
      if (!request) continue;
      clearTimeout(request.timer);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    }
  });
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}. ${stderr}`));
      }, 12000);
      pending.set(id, { resolve, reject, timer });
      child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
    });
  }
  async function close() {
    if (child.exitCode === null) {
      await send("Browser.close").catch(() => child.kill("SIGKILL"));
      if (child.exitCode === null) await new Promise(resolve => child.once("exit", resolve));
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  }
  try {
    await send("Browser.getVersion");
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const command = (method, params) => send(method, params, sessionId);
    await command("Page.enable");
    await command("Runtime.enable");
    async function evaluate(expression) {
      const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    }
    function on(method, handler) {
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(handler);
      return () => listeners.get(method).delete(handler);
    }
    return { command, evaluate, close, exceptions, on, browserCommand: send };
  } catch (error) {
    child.kill("SIGKILL");
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
    throw error;
  }
}
