"use strict";
module.exports = `
  :host {
    all: initial; position: fixed; z-index: 105; display: block; color: var(--b3-theme-on-surface, #333);
    font: 13px/1.5 var(--b3-font-family, system-ui, sans-serif); direction: ltr;
    --sgo-surface: var(--b3-theme-surface, #fff); --sgo-text: var(--b3-theme-on-background, #333);
    --sgo-muted: var(--b3-theme-on-surface-light, #888); --sgo-line: var(--b3-border-color, #e5e5e5);
    --sgo-accent: var(--b3-theme-primary, #4275e8); --sgo-row: 28px;
  }
  :host([hidden]) { display: none !important; }
  * { box-sizing: border-box; }
  .rail { width: 30px; max-height: var(--sgo-height, 66.666vh); display: flex; flex-direction: column;
    padding: 10px 6px; border: 1px solid transparent; border-radius: 16px; background: transparent; }
  .list { margin: 0; padding: 0; list-style: none; overflow-x: hidden; overflow-y: auto; min-height: 0;
    overscroll-behavior: contain; scrollbar-width: none; }
  .list::-webkit-scrollbar { display: none; }
  .entry { appearance: none; display: flex; align-items: center; justify-content: flex-end; gap: 8px;
    width: 100%; height: var(--sgo-row); margin: 0; padding: 0; border: 0; border-radius: 4px;
    font: inherit; text-align: left; background: transparent; color: var(--sgo-muted); cursor: pointer; }
  .number, .label, .level, .footer { display: none; }
  .marker-slot { width: 16px; flex: 0 0 16px; display: flex; justify-content: flex-end; align-items: center; }
  .marker { display: block; width: var(--mark-width, 8px); height: 3px; border-radius: 4px; background: currentColor; opacity: .52; }
  .entry[aria-current="location"] { color: var(--sgo-accent); }
  .entry[aria-current="location"] .marker { width: 16px; opacity: 1; }
  .entry:hover { color: var(--sgo-text); }
  .entry:hover .marker { opacity: 1; }
  .entry:focus-visible { outline: 1px solid var(--sgo-accent); outline-offset: -1px; }
  :host([data-expanded]) .rail { width: max-content; min-width: 140px; max-width: var(--sgo-width, 340px);
    border-color: var(--sgo-line); background: var(--sgo-surface); box-shadow: 0 5px 24px #00000012; }
  :host([data-expanded]) .entry { padding-left: 7px; }
  :host([data-expanded]) .number { display: block; min-width: 17px; flex: 0 0 auto; font-size: 10px;
    font-variant-numeric: tabular-nums; text-align: right; opacity: .65; }
  :host([data-expanded][data-no-numbers]) .number { display: none; }
  :host([data-expanded]) .level { display: block; font-size: 9px; opacity: .6; flex: 0 0 17px; }
  :host([data-expanded]) .label { display: block; flex: 1 1 auto; min-width: 0;
    max-width: var(--sgo-label-width, 230px); padding-left: var(--indent, 0px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :host([data-expanded]) .footer { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 4px 0;
    margin-top: 6px; border-top: 1px solid var(--sgo-line); font-size: 10px; color: var(--sgo-muted); flex-shrink: 0; }
  .count { max-width: 230px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .refresh { appearance: none; border: 0; padding: 0; background: none; color: var(--sgo-accent); font: inherit; cursor: pointer; }
  :host([aria-busy="true"]) .refresh { opacity: .55; }
`;
