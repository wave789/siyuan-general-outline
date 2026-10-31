import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { launchBrowser } from "./browser.mjs";

const config = process.env.SIYUAN_TEST_CONFIG;
const root = new URL("../", import.meta.url);
const p = 'window.siyuan.ws.app.plugins.find(plugin=>plugin.name==="siyuan-general-outline")';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
test("native SiYuan integration", { skip: !config && "Run npm run test:integration with SiYuan installed", timeout: 120000 }, async t => {
  const info = JSON.parse(await readFile(config, "utf8"));
  assert.ok(info.workspace.startsWith("/tmp/"), "only an isolated temporary workspace is permitted");
  const conf = JSON.parse(await readFile(`${info.workspace}/conf/conf.json`, "utf8"));
  async function post(path, body = {}) {
    const response = await fetch(info.base + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Token ${conf.api.token}` }, body: JSON.stringify(body) });
    const result = await response.json(); assert.equal(result.code, 0, result.msg); return result.data;
  }
  const browser = await launchBrowser(); t.after(() => browser.close());
  const { command, evaluate } = browser;
  async function until(expression, timeout = 12000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { try { if (await evaluate(expression)) return; } catch { /* loading */ } await pause(80); }
    throw new Error(`Condition did not become true: ${expression}`);
  }
  const open = id => evaluate(`window.__sgoIntegrationAPI.openTab({app:window.siyuan.ws.app,doc:{id:${JSON.stringify(id)}}}).then(()=>true)`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await command("Page.navigate", { url: info.base });
  await until('document.readyState === "complete"');
  await evaluate(`fetch('/api/system/loginAuth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({authCode:${JSON.stringify(info.authCode)}})}).then(r=>r.json())`);
  await command("Page.navigate", { url: info.base });
  await until(`Boolean(window.__sgoIntegrationAPI && ${p}?.rail)`);
  await open(info.doc1);
  await until(`${p}.allHeadings.length === 80`);

  await t.test("loads through the real host and reads all 80 headings while DOM is partial", async () => {
    const status = await evaluate(`({source:${p}.source,count:${p}.allHeadings.length,dom:${p}.current.wysiwyg.element.querySelectorAll('[data-type=NodeHeading]').length,error:${p}.lastError})`);
    assert.equal(status.source, "api"); assert.equal(status.count, 80); assert.equal(status.error, null);
    assert.ok(status.dom < 80, `DOM headings: ${status.dom}`);
    assert.equal(await evaluate(`${p}.rail.headings.filter(h=>h.text==='相同的标题').length`), 2);
    assert.deepEqual(await evaluate(`${p}.rail.headings.slice(0,6).map(h=>h.level)`), [1, 2, 3, 4, 5, 6]);
  });

  await t.test("real pointer hover reveals labels and numbers, leaving collapses the panel", async () => {
    const point = await evaluate(`(() => {const r=${p}.rail.buttons[2].getBoundingClientRect();return {x:r.right-4,y:r.y+r.height/2};})()`);
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await until(`${p}.rail.host.hasAttribute('data-expanded')`);
    assert.equal(await evaluate(`getComputedStyle(${p}.rail.shadow.querySelector('.label')).display`), "block");
    assert.equal(await evaluate(`getComputedStyle(${p}.rail.shadow.querySelector('.number')).display`), "block");
    assert.ok(await evaluate(`${p}.rail.rail.getBoundingClientRect().height <= ${p}.current.element.getBoundingClientRect().height * 2/3 + 1`));
    await mkdir(new URL("artifacts/", root), { recursive: true });
    const { data } = await command("Page.captureScreenshot", { format: "png" });
    await writeFile(new URL("artifacts/siyuan-outline-light.png", root), Buffer.from(data, "base64"));
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 40, y: 30 });
    await until(`!${p}.rail.host.hasAttribute('data-expanded')`);
  });

  await t.test("an unrendered heading is loaded by native block navigation and located", async () => {
    const id = await evaluate(`${p}.rail.headings[70].id`);
    assert.equal(await evaluate(`${p}.current.wysiwyg.element.querySelector('[data-node-id="${id}"]') === null`), true);
    await evaluate(`${p}.jump(${JSON.stringify(id)}).then(()=>true)`);
    await until(`${p}.rail.active === ${JSON.stringify(id)} && Boolean(${p}.current.wysiwyg.element.querySelector('[data-node-id="${id}"]'))`);
    assert.equal(await evaluate(`${p}.current.block.rootID`), info.doc1);
    const gap = await evaluate(`(() => {const p=${p}; return p.current.wysiwyg.element.querySelector('[data-node-id="${id}"]').getBoundingClientRect().top-p.getScroller().getBoundingClientRect().top;})()`);
    assert.ok(gap >= 0 && gap < 120, `heading offset: ${gap}`);
  });

  await t.test("keyboard navigation reaches first and last entries and Escape collapses", async () => {
    await evaluate(`${p}.rail.buttons[1].focus()`);
    for (const [key, expected] of [["ArrowDown", 2], ["End", 79], ["Home", 0]]) {
      await command("Input.dispatchKeyEvent", { type: "keyDown", key, code: key });
      assert.equal(await evaluate(`${p}.rail.shadow.activeElement.dataset.id`), await evaluate(`${p}.rail.headings[${expected}].id`));
    }
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
    assert.equal(await evaluate(`${p}.rail.host.hasAttribute('data-expanded')`), false);
  });

  await t.test("folded subheadings remain indexed and native navigation can reveal them", async () => {
    const ids = await evaluate(`${p}.allHeadings.slice(0,3).map(h=>h.id)`);
    await post("/api/attr/setBlockAttrs", { id: ids[0], attrs: { fold: "1" } });
    await evaluate(`${p}.refresh().then(()=>true)`);
    assert.equal(await evaluate(`${p}.allHeadings.length`), 80);
    await evaluate(`${p}.jump(${JSON.stringify(ids[2])}).then(()=>true)`);
    await until(`${p}.rail.active === ${JSON.stringify(ids[2])}`);
    assert.ok(await evaluate(`${p}.current.wysiwyg.element.querySelector('[data-node-id="${ids[2]}"]').getClientRects().length > 0`));
    await post("/api/attr/setBlockAttrs", { id: ids[0], attrs: { fold: "0" } });
  });

  await t.test("heading-level settings filter the full outline and are persisted", async () => {
    await evaluate(`${p}.saveSettings({maxLevel:2}).then(()=>true)`);
    await until(`${p}.rail.headings.length === 28`);
    assert.equal(await evaluate(`${p}.rail.headings.every(h=>h.level<=2)`), true);
    const stored = JSON.parse(await readFile(`${info.workspace}/data/storage/petal/siyuan-general-outline/settings.json`, "utf8"));
    assert.equal(stored.maxLevel, 2);
    await evaluate(`${p}.saveSettings({maxLevel:6}).then(()=>true)`);
    await until(`${p}.rail.headings.length === 80`);
  });

  await t.test("switching documents replaces the outline, without mixing headings", async () => {
    await open(info.doc2);
    await until(`${p}.current.block.rootID === ${JSON.stringify(info.doc2)} && ${p}.allHeadings.length === 3`);
    assert.equal(await evaluate(`${p}.rail.headings[0].text`), "第二篇的一级标题");
  });

  await t.test("a heading edit updates the outline from native transactions", async () => {
    const id = await evaluate(`${p}.allHeadings[0].id`);
    await post("/api/block/updateBlock", { id, dataType: "markdown", data: "# 已更新的标题" });
    await until(`${p}.allHeadings[0].text === '已更新的标题'`);
    assert.equal(await evaluate(`${p}.allHeadings.length`), 3);
  });

  await t.test("split-view focus moves the rail to the focused editor's right edge", async () => {
    const doc3 = await post("/api/filetree/createDocWithMd", { notebook: info.notebook, path: "/分屏验证", markdown: "# 分屏标题一\n\n正文\n\n## 分屏标题二" });
    await evaluate(`window.__sgoIntegrationAPI.openTab({app:window.siyuan.ws.app,doc:{id:${JSON.stringify(doc3)}},position:'right'}).then(()=>true)`);
    await until(`${p}.current.block.rootID === ${JSON.stringify(doc3)} && ${p}.allHeadings.length === 2`);
    const peer = await evaluate(`(() => {const p=${p};const editor=[...p.editors.values()].find(e=>e!==p.current&&p.isVisible(e));if(!editor)return null;const r=editor.wysiwyg.element.querySelector('[contenteditable]')?.getBoundingClientRect();return r&&{id:editor.block.rootID,x:r.left+15,y:r.top+10};})()`);
    assert.ok(peer, "a different visible editor exists");
    await command("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, x: peer.x, y: peer.y });
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, x: peer.x, y: peer.y });
    await until(`${p}.current.block.rootID === ${JSON.stringify(peer.id)}`);
    await pause(100);
    const gap = await evaluate(`${p}.current.element.getBoundingClientRect().right - ${p}.rail.host.getBoundingClientRect().right`);
    assert.ok(Math.abs(gap - 10) < 2, `right edge gap: ${gap}`);
  });

  await t.test("top-bar toggle and unloading cleanly hide and remove the navigation", async () => {
    await evaluate(`${p}.topBar.click()`);
    await until(`${p}.settingsValue.enabled === false && ${p}.rail.host.hidden`);
    await evaluate(`${p}.topBar.click()`);
    await until(`${p}.settingsValue.enabled === true && !${p}.rail.host.hidden`);
    await post("/api/petal/setPetalEnabled", { packageName: "siyuan-general-outline", enabled: false });
    await until('document.querySelector(".siyuan-general-outline") === null');
    assert.equal(await evaluate(`${p} === undefined`), true);
  });
  assert.deepEqual(browser.exceptions, [], "no uncaught errors in the real frontend");
});
