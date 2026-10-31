"use strict";
const styles = require("./styles");
class OutlineRail {
  constructor({ onJump, onRefresh }) {
    this.onJump = onJump;
    this.onRefresh = onRefresh;
    this.headings = [];
    this.active = null;
    this.pointer = false;
    this.keyboard = false;
    this.abort = new AbortController();
    this.host = document.createElement("div");
    this.host.className = "siyuan-general-outline";
    this.host.dataset.plugin = "siyuan-general-outline";
    this.host.hidden = true;
    const shadow = this.host.attachShadow({ mode: "open" });
    this.shadow = shadow;
    const style = document.createElement("style");
    style.textContent = styles;
    this.rail = document.createElement("nav");
    this.rail.className = "rail";
    this.rail.setAttribute("aria-label", "当前文档的标题导航");
    this.list = document.createElement("ol");
    this.list.className = "list";
    this.footer = document.createElement("div");
    this.footer.className = "footer";
    this.count = document.createElement("span");
    this.count.className = "count";
    this.count.setAttribute("role", "status");
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "refresh";
    refresh.textContent = "刷新";
    refresh.title = "重新读取当前文档的完整大纲";
    this.footer.append(this.count, refresh);
    this.rail.append(this.list, this.footer);
    shadow.append(style, this.rail);
    document.body.append(this.host);
    const listen = (element, type, handler, options = {}) => element.addEventListener(type, handler, { ...options, signal: this.abort.signal });
    listen(this.host, "pointerenter", () => { this.pointer = true; this.keyboard = false; this.expand(); });
    listen(this.host, "pointerleave", () => { this.pointer = false; if (!this.keyboard) this.closeTimer = setTimeout(() => this.collapse(), 100); });
    listen(this.list, "pointerdown", () => { this.keyboard = false; });
    listen(this.list, "focusin", () => { if (!this.pointer) this.keyboard = true; this.expand(); });
    listen(shadow, "focusout", () => {
      clearTimeout(this.focusTimer);
      this.focusTimer = setTimeout(() => { if (!shadow.activeElement) { this.keyboard = false; if (!this.pointer) this.collapse(); } }, 0);
    });
    listen(this.list, "click", event => {
      const button = event.target.closest(".entry");
      if (button) this.onJump(button.dataset.id);
    });
    listen(refresh, "click", () => this.onRefresh());
    listen(shadow, "keydown", event => {
      if (event.key === "Escape") { this.collapse(); event.stopPropagation(); return; }
      const button = event.target.closest(".entry");
      if (!button) return;
      const index = this.buttons.indexOf(button);
      const target = { ArrowDown: Math.min(index + 1, this.buttons.length - 1), ArrowUp: Math.max(0, index - 1), Home: 0, End: this.buttons.length - 1 }[event.key];
      if (target === undefined) return;
      event.preventDefault(); event.stopPropagation(); this.keyboard = true; this.expand(); this.buttons[target].focus();
    });
  }
  expand() { clearTimeout(this.closeTimer); this.host.setAttribute("data-expanded", ""); }
  collapse() { clearTimeout(this.closeTimer); this.host.removeAttribute("data-expanded"); this.keyboard = false; }
  show(value) { this.host.hidden = !value || !this.headings.length; }
  busy(value) { if (value) this.host.setAttribute("aria-busy", "true"); else this.host.removeAttribute("aria-busy"); }
  message(value) { this.count.textContent = value; this.count.title = value; }
  update(headings, settings, source) {
    this.headings = headings;
    const focusId = this.shadow.activeElement?.dataset.id;
    const savedScroll = this.list.scrollTop;
    this.host.toggleAttribute("data-no-numbers", !settings.showNumbers);
    this.host.style.setProperty("--sgo-row", `${settings.rowHeight}px`);
    const fragment = document.createDocumentFragment();
    this.buttons = headings.map((heading, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button"; button.className = "entry"; button.dataset.id = heading.id;
      button.title = `${index + 1}. H${heading.level} ${heading.text}`;
      button.setAttribute("aria-label", button.title);
      button.style.setProperty("--mark-width", `${Math.max(5, 16 - (heading.level - 1) * 2)}px`);
      button.style.setProperty("--indent", `${(heading.level - 1) * 7}px`);
      for (const [className, text] of [["number", String(index + 1)], ["level", `H${heading.level}`], ["label", heading.text]]) {
        const span = document.createElement("span"); span.className = className; span.textContent = text; button.append(span);
      }
      const slot = document.createElement("span"); slot.className = "marker-slot"; slot.setAttribute("aria-hidden", "true");
      const marker = document.createElement("span"); marker.className = "marker"; slot.append(marker); button.append(slot);
      if (heading.id === this.active) button.setAttribute("aria-current", "location");
      item.append(button); fragment.append(item); return button;
    });
    this.list.replaceChildren(fragment);
    this.list.scrollTop = savedScroll;
    this.message(`${headings.length} 个标题${source === "dom" ? " · 仅已加载" : ""}`);
    if (focusId && this.keyboard) this.buttons.find(button => button.dataset.id === focusId)?.focus({ preventScroll: true });
    this.show(settings.enabled);
  }
  setActive(id) {
    if (this.active === id) return;
    this.buttons?.find(button => button.dataset.id === this.active)?.removeAttribute("aria-current");
    this.active = id;
    const button = this.buttons?.find(item => item.dataset.id === id);
    button?.setAttribute("aria-current", "location");
    if (!button || this.pointer || this.keyboard) return;
    const bounds = button.getBoundingClientRect(); const viewport = this.list.getBoundingClientRect();
    if (bounds.top < viewport.top) this.list.scrollTop -= viewport.top - bounds.top;
    else if (bounds.bottom > viewport.bottom) this.list.scrollTop += bounds.bottom - viewport.bottom;
  }
  position(bounds, settings) {
    const top = Math.max(0, bounds.top); const bottom = Math.min(innerHeight, bounds.bottom);
    const height = bottom - top;
    const width = Math.max(0, Math.min(innerWidth, bounds.right) - Math.max(0, bounds.left));
    if (height < 100 || width < 150) { this.host.hidden = true; return; }
    this.host.style.setProperty("--sgo-height", `${Math.floor(height * 2 / 3)}px`);
    this.host.style.setProperty("--sgo-width", `${Math.min(350, width - 30)}px`);
    this.host.style.setProperty("--sgo-label-width", `${Math.max(40, Math.min(230, width - 140))}px`);
    this.host.style.top = `${top + height / 2}px`;
    this.host.style.right = `${Math.max(0, innerWidth - Math.min(innerWidth, bounds.right)) + settings.rightOffset}px`;
    this.host.style.transform = "translateY(-50%)";
    this.show(settings.enabled);
  }
  destroy() {
    this.abort.abort(); clearTimeout(this.closeTimer); clearTimeout(this.focusTimer); this.host.remove(); this.headings = []; this.buttons = [];
  }
}
module.exports = OutlineRail;
