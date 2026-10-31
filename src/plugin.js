"use strict";
const api = require("siyuan");
const { normalizeSettings, flattenOutline, unwrapEditor, headingElements } = require("./headings");
const OutlineRail = require("./rail");
const ICON = '<symbol id="iconSiyuanGeneralOutline" viewBox="0 0 24 24"><path d="M5 3.5h9l3 3V20H5zM14 3.5V7h3M8 10h6M8 14h4M8 17h6M20 7h2M19 12h3M20 17h2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></symbol>';
class GeneralOutlinePlugin extends api.Plugin {
  async onload() {
    this.disposed = false;
    this.requestId = 0;
    this.jumpId = 0;
    this.handlers = [];
    this.editors = new Map();
    this.settingsValue = normalizeSettings();
    this.allHeadings = [];
    this.source = "api";
    this.abort = new AbortController();
    try { this.settingsValue = normalizeSettings(await this.loadData("settings.json")); } catch { /* Defaults are usable when no settings exist yet. */ }
    if (this.disposed) return;
    this.addIcons(ICON);
    this.rail = new OutlineRail({ onJump: id => this.jump(id), onRefresh: () => this.refresh() });
    this.topBar = this.addTopBar({ id: "outline", icon: "iconSiyuanGeneralOutline", title: "标题导航：点击开关，右键设置", position: "right", callback: () => this.toggle(), contextMenu: menu => {
      menu.addItem({ icon: "iconSiyuanGeneralOutline", label: "标题导航设置", click: () => this.openSetting() });
    } });
    this.addCommand({ langKey: "toggleOutline", langText: "切换右侧标题导航", callback: () => this.toggle() });
    this.addCommand({ langKey: "refreshOutline", langText: "刷新当前文档标题导航", callback: () => this.refresh() });
    this.addCommand({ langKey: "focusOutline", langText: "聚焦当前文档标题导航", callback: () => { this.rail.expand(); this.rail.buttons?.[0]?.focus(); } });
    this.createSettings();
    for (const type of ["loaded-protyle-static", "loaded-protyle-dynamic", "switch-protyle", "switch-protyle-mode", "click-editorcontent"]) {
      this.bind(type, event => {
        const editor = unwrapEditor(event.detail?.protyle);
        if (editor) this.editors.set(editor.element, editor);
        if (type === "switch-protyle" || type === "click-editorcontent") this.activate(editor);
        else this.syncActive();
        if (this.current === editor) {
          this.scheduleFrame();
          if (type !== "loaded-protyle-dynamic") this.scheduleRefresh();
        }
      });
    }
    this.bind("destroy-protyle", event => {
      const editor = unwrapEditor(event.detail?.protyle);
      if (editor) this.editors.delete(editor.element);
      if (editor === this.current) { this.activate(null); this.syncActive(); }
    });
    this.bind("ws-main", event => {
      if (["transactions", "rename", "reload", "setAttrs", "moveDoc"].includes(event.detail?.cmd)) this.scheduleRefresh();
    });
    const listen = (target, event, handler, options = {}) => target.addEventListener(event, handler, { ...options, signal: this.abort.signal });
    listen(document, "pointerdown", event => {
      if (event.composedPath().includes(this.rail.host)) return;
      this.jumpId++;
      const root = event.target.closest?.(".protyle");
      if (root) { this.discoverEditors(); this.activate(this.editors.get(root)); }
    }, { capture: true });
    listen(document, "focusin", event => {
      const root = event.target.closest?.(".protyle");
      if (root) { this.discoverEditors(); this.activate(this.editors.get(root)); }
    });
    listen(document, "scroll", () => this.scheduleFrame(), { capture: true, passive: true });
    listen(window, "resize", () => this.scheduleFrame(), { passive: true });
    listen(document, "visibilitychange", () => { if (!document.hidden) { this.syncActive(); this.scheduleRefresh(); } });
    this.layoutObserver = new MutationObserver(() => {
      if (this.current && !this.current.element.isConnected) this.syncActive();
      this.scheduleFrame();
    });
    this.layoutObserver.observe(document.body, { childList: true, subtree: true });
    this.resizeObserver = new ResizeObserver(() => this.scheduleFrame());
    this.updateToggle();
    this.syncActive();
  }
  onLayoutReady() { if (!this.disposed && this.rail) this.syncActive(); }
  bind(type, handler) { this.eventBus.on(type, handler); this.handlers.push([type, handler]); }
  discoverEditors() {
    for (const wrapper of api.getAllEditor?.() || []) {
      const editor = unwrapEditor(wrapper);
      if (editor) this.editors.set(editor.element, editor);
    }
    for (const [element] of this.editors) if (!element.isConnected) this.editors.delete(element);
  }
  isVisible(editor) {
    return editor?.element?.isConnected && !editor.element.closest(".fn__none") && editor.element.getBoundingClientRect().height > 0;
  }
  syncActive() {
    if (this.disposed || !this.rail) return;
    this.discoverEditors();
    const active = unwrapEditor(api.getActiveEditor?.());
    if (this.isVisible(active)) return this.activate(active);
    if (this.isVisible(this.current)) return this.scheduleFrame();
    this.activate([...this.editors.values()].find(editor => this.isVisible(editor)) || null);
  }
  activate(editor) {
    if (this.disposed || !this.rail) return;
    if (!this.isVisible(editor)) editor = null;
    if (editor === this.current && editor?.block.rootID === this.rootId) { this.scheduleFrame(); return; }
    this.requestId++; this.jumpId++;
    clearTimeout(this.refreshTimer);
    this.headingObserver?.disconnect(); this.resizeObserver?.disconnect();
    this.current = editor; this.rootId = editor?.block.rootID || null;
    this.allHeadings = []; this.rail.collapse(); this.render();
    if (!editor) return;
    this.editors.set(editor.element, editor);
    this.resizeObserver?.observe(editor.element);
    if (editor.contentElement) this.resizeObserver?.observe(editor.contentElement);
    this.headingObserver = new MutationObserver(records => {
      const changesHeading = records.some(record => {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (target?.closest('[data-type="NodeHeading"]')) return true;
        return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches?.('[data-type="NodeHeading"]') || node.querySelector?.('[data-type="NodeHeading"]')));
      });
      this.scheduleFrame();
      if (changesHeading) { this.overlayLiveText(); this.scheduleRefresh(); }
    });
    if (editor.wysiwyg?.element) this.headingObserver.observe(editor.wysiwyg.element, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["data-type", "data-subtype", "data-node-id", "fold"] });
    this.refresh();
  }
  scheduleRefresh() {
    if (this.disposed || !this.current || !this.settingsValue.enabled) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refresh(), 400);
  }
  async requestOutline(editor) {
    const body = { id: editor.block.rootID, preview: false };
    if (editor.notebookId) body.notebook = editor.notebookId;
    return this.requestJSON("/api/outline/getDocOutline", body);
  }
  async requestJSON(path, body) {
    const request = api.fetchSyncPost ? api.fetchSyncPost(path, body) : new Promise((resolve, reject) => {
      try { const result = api.fetchPost(path, body, resolve); result?.catch?.(reject); } catch (error) { reject(error); }
    });
    let timer;
    try { return await Promise.race([request, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("读取文档大纲超时")), 10000); })]); }
    finally { clearTimeout(timer); }
  }
  async refresh() {
    clearTimeout(this.refreshTimer);
    if (this.disposed || !this.current || !this.settingsValue.enabled) return;
    const editor = this.current; const rootId = editor.block.rootID; const requestId = ++this.requestId;
    this.rail.busy(true);
    try {
      const response = await this.requestOutline(editor);
      if (this.disposed || requestId !== this.requestId || this.current !== editor || editor.block.rootID !== rootId) return;
      if (!response || response.code !== 0 || !Array.isArray(response.data)) throw new Error(response?.msg || "无法读取完整大纲");
      this.allHeadings = flattenOutline(response.data, document); this.source = "api"; this.lastError = null;
      this.overlayLiveText(false); this.render();
    } catch (error) {
      if (this.disposed || requestId !== this.requestId || this.current !== editor) return;
      this.lastError = error.message;
      if (!this.allHeadings.length) { this.allHeadings = headingElements(editor).map(({ element, ...heading }) => heading); this.source = "dom"; }
      this.render(); this.rail.message(`读取失败 · ${this.allHeadings.length} 个已知标题`);
      this.rail.count.title = `${error.message}；点击刷新重试`;
    } finally { if (!this.disposed && requestId === this.requestId) this.rail.busy(false); }
  }
  overlayLiveText(render = true) {
    if (!this.current) return;
    const rendered = new Map(headingElements(this.current).map(heading => [heading.id, heading]));
    let changed = false;
    this.allHeadings = this.allHeadings.map(heading => {
      const live = rendered.get(heading.id);
      if (live && (live.text !== heading.text || live.level !== heading.level)) { changed = true; return { id: heading.id, text: live.text, level: live.level }; }
      return heading;
    });
    if (changed && render) this.render();
  }
  render() {
    if (!this.rail) return;
    this.rail.update(this.allHeadings.filter(heading => heading.level <= this.settingsValue.maxLevel), this.settingsValue, this.source);
    this.scheduleFrame();
  }
  scheduleFrame() {
    if (this.disposed || this.frame || !this.rail) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.updatePosition(); });
  }
  updatePosition() {
    const editor = this.current;
    if (!this.isVisible(editor) || !this.settingsValue.enabled) { this.rail.show(false); return; }
    this.rail.position(editor.element.getBoundingClientRect(), this.settingsValue);
    const scroller = this.getScroller();
    const viewport = scroller.getBoundingClientRect();
    const known = new Map(this.rail.headings.map((heading, index) => [heading.id, index]));
    const rendered = headingElements(editor).filter(item => known.has(item.id) && item.element.getClientRects().length && getComputedStyle(item.element).display !== "none");
    let selected = null;
    for (const heading of rendered) {
      if (heading.element.getBoundingClientRect().top <= viewport.top + 90) selected = heading.id;
      else break;
    }
    if (scroller.scrollTop > 0 && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 3) selected = rendered.at(-1)?.id || selected;
    if (performance.now() >= (this.activeLock || 0)) this.rail.setActive(selected || rendered[0]?.id || null);
  }
  getScroller() {
    const preview = this.current?.preview;
    if (preview?.element && !preview.element.classList.contains("fn__none") && preview.element.getBoundingClientRect().height) return preview.element.querySelector(".b3-typography") || preview.element;
    return this.current?.contentElement || this.current?.wysiwyg?.element?.parentElement || document.scrollingElement;
  }
  async jump(id) {
    const editor = this.current; if (!editor || this.disposed) return;
    const request = ++this.jumpId;
    const find = () => headingElements(editor).find(heading => heading.id === id)?.element;
    let target = find();
    try {
      if (!target || !target.getClientRects().length || target.closest('[fold="1"]')?.getAttribute("data-node-id") !== id && target.closest('[fold="1"]')) {
        this.rail.busy(true); this.rail.message("正在定位标题…");
        const fold = await this.requestJSON("/api/block/checkBlockFold", { id, ...(editor.notebookId ? { notebook: editor.notebookId } : {}) });
        if (this.disposed || request !== this.jumpId || this.current !== editor) return;
        const folded = fold?.code === 0 && fold.data?.isFolded;
        const actions = [api.Constants?.CB_GET_HL, ...(folded ? [api.Constants?.CB_GET_ALL] : [api.Constants?.CB_GET_CONTEXT, api.Constants?.CB_GET_SETID]), api.Constants?.CB_GET_HTML].filter(Boolean);
        await api.openTab({ app: this.app, doc: { id, ...(folded ? { zoomIn: true } : {}), ...(actions.length ? { action: actions } : {}) }, keepCursor: false });
        for (let i = 0; i < 35 && request === this.jumpId && !this.disposed; i++) {
          target = find(); if (target?.getClientRects().length) break;
          await new Promise(resolve => setTimeout(resolve, 80));
        }
      }
      if (this.disposed || request !== this.jumpId || this.current !== editor) return;
      if (!target?.isConnected || !target.getClientRects().length) throw new Error("标题尚未加载，请刷新目录后重试");
      const scroller = this.getScroller();
      const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - Math.min(60, scroller.clientHeight * .12);
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      scroller.scrollTo({ top: Math.max(0, top), behavior: reduced ? "instant" : "smooth" });
      this.activeLock = performance.now() + 1100; this.rail.setActive(id);
      if (!reduced && target.animate) target.animate([{ outline: "2px solid transparent" }, { outline: "2px solid var(--b3-theme-primary)", outlineOffset: "4px" }, { outline: "2px solid transparent" }], { duration: 1200 });
      this.rail.message(`${this.rail.headings.length} 个标题`);
    } catch (error) {
      if (!this.disposed) { this.rail.message(error.message); api.showMessage?.(error.message, 4000, "error"); }
    } finally { if (!this.disposed && request === this.jumpId) this.rail.busy(false); }
  }
  updateToggle() { this.topBar?.classList.toggle("siyuan-general-outline-topbar--disabled", !this.settingsValue.enabled); }
  async saveSettings(patch) {
    this.settingsValue = normalizeSettings({ ...this.settingsValue, ...patch });
    this.updateToggle(); this.render();
    if (this.settingsValue.enabled) { this.syncActive(); this.scheduleRefresh(); }
    try { await this.saveData("settings.json", this.settingsValue); }
    catch { api.showMessage?.("标题导航设置未能保存", 3000, "error"); }
  }
  toggle() { this.saveSettings({ enabled: !this.settingsValue.enabled }); }
  createSettings() {
    this.setting = new api.Setting({ width: "520px" });
    for (const [key, title, type, min, max] of [
      ["enabled", "启用右侧标题导航", "checkbox"], ["showNumbers", "展开时显示序号", "checkbox"],
      ["maxLevel", "显示到标题级别（1–6）", "number", 1, 6], ["rowHeight", "标记间距（20–40 像素）", "number", 20, 40], ["rightOffset", "距编辑器右边缘（4–80 像素）", "number", 4, 80]
    ]) {
      this.setting.addItem({ title, description: key === "enabled" ? "跟随当前活动文档；无标题时隐藏。目录高度最多为编辑区的 2/3。" : "", createActionElement: () => {
        const input = document.createElement("input"); input.type = type; input.className = type === "checkbox" ? "b3-switch" : "b3-text-field";
        if (type === "checkbox") input.checked = this.settingsValue[key]; else { input.value = this.settingsValue[key]; input.min = min; input.max = max; input.step = "1"; input.style.width = "90px"; }
        input.addEventListener("change", () => this.saveSettings({ [key]: type === "checkbox" ? input.checked : Number(input.value) })); return input;
      } });
    }
  }
  onunload() {
    this.disposed = true; this.requestId++; this.jumpId++;
    clearTimeout(this.refreshTimer); if (this.frame) cancelAnimationFrame(this.frame);
    this.abort?.abort(); this.headingObserver?.disconnect(); this.layoutObserver?.disconnect(); this.resizeObserver?.disconnect();
    for (const [type, handler] of this.handlers || []) this.eventBus.off(type, handler);
    this.handlers = []; this.setting?.close?.(); this.rail?.destroy(); this.editors?.clear(); this.current = null; this.allHeadings = [];
  }
}
module.exports = GeneralOutlinePlugin;
