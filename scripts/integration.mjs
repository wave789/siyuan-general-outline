import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, cp, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const kernel = process.env.SIYUAN_KERNEL || "/opt/SiYuan/resources/kernel/SiYuan-Kernel";
const temporary = await mkdtemp(join(tmpdir(), "sgo-integration-"));
const workspace = join(temporary, "workspace"), home = join(temporary, "home");
await mkdir(workspace); await mkdir(home);
const server = createServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port; await new Promise(resolve => server.close(resolve));
const base = `http://127.0.0.1:${port}`, authCode = randomUUID();
let child, conf, logs = "";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start() {
  logs = "";
  child = spawn(kernel, ["serve", "--workspace", workspace, "--home-dir", home, "--port", String(port), "--accessAuthCode", authCode, "--lang", "zh-CN", "--wd", process.env.SIYUAN_RESOURCES || dirname(dirname(kernel))], { stdio: ["ignore", "pipe", "pipe"] });
  child.on("error", error => { logs += error.message; });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { logs = (logs + data.toString()).slice(-16000); });
  for (let i = 0; i < 100; i++) {
    try { if (logs.includes("kernel booted") && (await fetch(`${base}/api/system/version`, { method: "POST" })).ok) { conf = JSON.parse(await readFile(join(workspace, "conf/conf.json"), "utf8")); return; } } catch { /* booting */ }
    if (child.exitCode !== null) throw new Error(logs);
    await pause(150);
  }
  throw new Error(`SiYuan did not start: ${logs}`);
}
async function post(path, body = {}) {
  const response = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Token ${conf.api.token}` }, body: JSON.stringify(body) });
  const result = await response.json(); if (result.code) throw new Error(`${path}: ${result.msg}`); return result.data;
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  try { await post("/api/system/exit", { force: true }); } catch { /* exited */ }
  await Promise.race([new Promise(resolve => child.once("exit", resolve)), pause(5000)]);
  if (child.exitCode === null) child.kill("SIGTERM");
}
try {
  await start();
  const notebook = (await post("/api/notebook/createNotebook", { name: "General Outline Integration" })).notebook.id;
  await pause(600);
  async function create(title, markdown) {
    for (let i = 0; i < 10; i++) {
      try { return await post("/api/filetree/createDocWithMd", { notebook, path: `/${title}`, markdown }); }
      catch (error) { if (i === 9) throw error; await pause(300); }
    }
  }
  const markdown = Array.from({ length: 80 }, (_, i) => `${"#".repeat(i % 6 + 1)} ${i === 6 || i === 7 ? "相同的标题" : `章节 ${i + 1}`}\n\n${"用于验证真实思源长文档导航的段落。".repeat(12)}\n\n`).join("");
  const doc1 = await create("标题导航验证", markdown);
  const doc2 = await create("另一篇文档", "# 第二篇的一级标题\n\n正文\n\n## 第二篇的二级标题\n\n正文\n\n### 第三层\n\n正文");
  await stop();
  conf = JSON.parse(await readFile(join(workspace, "conf/conf.json"), "utf8"));
  conf.bazaar.trust = true; conf.editor.dynamicLoadBlocks = 24; conf.onboarding = { ...conf.onboarding, completed: true };
  await writeFile(join(workspace, "conf/conf.json"), JSON.stringify(conf));
  const target = join(workspace, "data/plugins/siyuan-general-outline");
  await mkdir(target, { recursive: true });
  for (const path of ["index.js", "index.css", "plugin.json", "icon.png", "i18n"]) await cp(new URL(path, root), join(target, path), { recursive: true });
  // Expose the host SDK for test actions only. This line never enters the distributable.
  await appendFile(join(target, "index.js"), '\nglobalThis.__sgoIntegrationAPI = require("siyuan");\n');
  await start();
  await post("/api/petal/setPetalEnabled", { packageName: "siyuan-general-outline", enabled: true });
  const config = join(temporary, "test.json");
  await writeFile(config, JSON.stringify({ base, workspace, doc1, doc2, notebook, authCode }));
  console.log(`Isolated SiYuan workspace: ${workspace}`);
  const test = spawn(process.execPath, ["--test", fileURLToPath(new URL("../tests/integration.test.mjs", import.meta.url))], { cwd: fileURLToPath(root), env: { ...process.env, SIYUAN_TEST_CONFIG: config }, stdio: "inherit" });
  const code = await new Promise(resolve => test.once("exit", resolve));
  process.exitCode = code || 0;
} catch (error) { console.error(error.message); console.error(logs); process.exitCode = 1; }
finally { await stop(); }
