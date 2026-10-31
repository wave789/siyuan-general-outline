import { launchBrowser } from "../tests/browser.mjs";
import { writeFile } from "node:fs/promises";
const browser = await launchBrowser();
try {
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 160, height: 160, deviceScaleFactor: 1, mobile: false });
  await browser.command("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await browser.command("Page.navigate", { url: new URL("../assets/icon.svg", import.meta.url).href });
  await new Promise(resolve => setTimeout(resolve, 250));
  const { data } = await browser.command("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 160, height: 160, scale: 1 } });
  await writeFile(new URL("../icon.png", import.meta.url), Buffer.from(data, "base64"));
  console.log("Rendered original assets/icon.svg → icon.png (160 × 160)");
} finally { await browser.close(); }
