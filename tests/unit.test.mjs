import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
const require = createRequire(import.meta.url);
const { flattenOutline, normalizeSettings, DEFAULTS } = require("../src/headings.js");

test("flattens actual SiYuan path/blocks/children shape, including empty name and populated content", () => {
  const result = flattenOutline([{ id: "first", name: "<strong>一级&nbsp;标题</strong>", subType: "h1", blocks: [{ id: "second", name: "", content: "二级&nbsp;标题", subType: "h2", folded: true, children: [{ id: "third", content: "三级标题", subType: "h3" }] }] }]);
  assert.deepEqual(result, [{ id: "first", level: 1, text: "一级 标题" }, { id: "second", level: 2, text: "二级 标题" }, { id: "third", level: 3, text: "三级标题" }]);
});
test("repeated heading text is retained by block ID and duplicate IDs are removed", () => {
  const result = flattenOutline([{ id: "a", subType: "h1", name: "重复" }, { id: "b", subType: "h2", name: "重复" }, { id: "a", subType: "h1", name: "重复" }]);
  assert.deepEqual(result.map(heading => heading.id), ["a", "b"]);
});
test("retains large complete outlines and ignores non-heading containers", () => {
  const result = flattenOutline([{ type: "container", children: Array.from({ length: 500 }, (_, i) => ({ id: `heading-${i}`, subType: `h${i % 6 + 1}`, name: `标题 ${i}` })) }]);
  assert.equal(result.length, 500);
  assert.equal(result[499].id, "heading-499");
  assert.equal(flattenOutline(null).length, 0);
});
test("validates stored settings without changing the defaults", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULTS);
  assert.deepEqual(normalizeSettings({ maxLevel: 99, rowHeight: -2, rightOffset: 1000, enabled: false, showNumbers: false }), { enabled: false, maxLevel: 6, showNumbers: false, rightOffset: 80, rowHeight: 20 });
  assert.equal(DEFAULTS.rowHeight, 28);
});
test("the shipped bundle exports a real Plugin subclass using only the host siyuan module", async () => {
  class Plugin {}
  const module = { exports: {} };
  const source = await readFile(new URL("../index.js", import.meta.url), "utf8");
  runInNewContext(source, { module, require: name => { assert.equal(name, "siyuan"); return { Plugin }; } });
  assert.equal(typeof module.exports, "function");
  assert.ok(module.exports.prototype instanceof Plugin);
});
test("manifest and original icon satisfy local plugin packaging requirements", async () => {
  const manifest = JSON.parse(await readFile(new URL("../plugin.json", import.meta.url), "utf8"));
  assert.equal(manifest.name, "siyuan-general-outline");
  const icon = await readFile(new URL("../icon.png", import.meta.url));
  assert.equal(icon.toString("hex", 0, 8), "89504e470d0a1a0a");
  assert.equal(icon.readUInt32BE(16), 160);
  assert.equal(icon.readUInt32BE(20), 160);
  assert.ok(icon.length < 65536);
});
