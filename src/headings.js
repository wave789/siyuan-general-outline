"use strict";

const DEFAULTS = Object.freeze({ enabled: true, maxLevel: 6, showNumbers: true, rightOffset: 10, rowHeight: 28 });
function normalizeSettings(value = {}) {
  if (!value || typeof value !== "object") value = {};
  const number = (key, min, max) => Number.isFinite(Number(value[key])) ? Math.max(min, Math.min(max, Math.round(Number(value[key])))) : DEFAULTS[key];
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULTS.enabled,
    maxLevel: number("maxLevel", 1, 6),
    showNumbers: typeof value.showNumbers === "boolean" ? value.showNumbers : DEFAULTS.showNumbers,
    rightOffset: number("rightOffset", 4, 80),
    rowHeight: number("rowHeight", 20, 40)
  };
}
function plainText(html, doc = globalThis.document) {
  if (typeof html !== "string") return "";
  if (!doc) return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const template = doc.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script, style, .protyle-attr").forEach(node => node.remove());
  template.content.querySelectorAll("img").forEach(node => node.replaceWith(doc.createTextNode(node.alt || "")));
  template.content.querySelectorAll('[data-type="inline-math"]').forEach(node => {
    if (!node.textContent) node.textContent = node.getAttribute("data-content") || "";
  });
  return (template.content.textContent || "").replace(/\s+/g, " ").trim();
}
function flattenOutline(tree, doc) {
  const result = [];
  const seen = new Set();
  function walk(nodes, depth = 1) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const id = node.id || node.ID;
      const subtype = node.subType || node.subtype || "";
      const explicit = /^h([1-6])$/.exec(subtype);
      const heading = Boolean(explicit) || node.type === "NodeHeading" || node.nodeType === "NodeHeading" || node.type === "h";
      if (heading && typeof id === "string" && !seen.has(id)) {
        seen.add(id);
        const level = explicit ? Number(explicit[1]) : Math.min(6, Math.max(1, Number(node.level) || depth));
        result.push({ id, level, text: plainText(node.name || node.content || "", doc) || "（空标题）" });
      }
      walk(node.blocks, heading ? depth + 1 : depth);
      walk(node.children, heading ? depth + 1 : depth);
    }
  }
  walk(tree);
  return result;
}
function unwrapEditor(value) {
  const editor = value?.protyle || value?.editor?.protyle || value;
  return editor?.element && editor?.block?.rootID ? editor : null;
}
function headingElements(protyle) {
  const preview = protyle.preview?.element;
  const isPreview = preview && !preview.classList.contains("fn__none") && preview.getBoundingClientRect().height > 0;
  const scope = isPreview ? preview : protyle.wysiwyg?.element;
  if (!scope) return [];
  return [...scope.querySelectorAll('[data-type="NodeHeading"][data-node-id], h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')].filter(node => {
    const owner = node.closest(".protyle");
    return (!owner || owner === protyle.element) && !node.closest('[data-type="NodeBlockQueryEmbed"], [data-type="NodeHTMLBlock"], [data-type="NodeIFrame"]');
  }).map(node => ({
    id: node.getAttribute("data-node-id") || node.id,
    level: Number((node.getAttribute("data-subtype") || node.tagName).replace(/[^1-6]/g, "")) || 1,
    text: (node.querySelector('[contenteditable="true"]')?.textContent || node.textContent || "").replace(/\s+/g, " ").trim() || "（空标题）",
    element: node
  }));
}
module.exports = { DEFAULTS, normalizeSettings, plainText, flattenOutline, unwrapEditor, headingElements };
