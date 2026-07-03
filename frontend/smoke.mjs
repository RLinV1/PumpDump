// Headless smoke-drive of the terminal UI via preinstalled Edge.
// Usage: node smoke.mjs                 (desktop only, 1440x900 — default, unchanged)
//        SMOKE_MOBILE=1 node smoke.mjs  (also runs the phone/tablet viewports below)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE_URL = process.env.SMOKE_URL || "http://localhost:5173";

const VIEWPORTS = [{ label: "desktop", width: 1440, height: 900 }];
if (process.env.SMOKE_MOBILE) {
  VIEWPORTS.push(
    { label: "375x667-iphone-se", width: 375, height: 667 },
    { label: "390x844-iphone-13", width: 390, height: 844 },
    { label: "430x932-iphone-pro-max", width: 430, height: 932 },
    { label: "768x1024-tablet", width: 768, height: 1024 },
  );
}

async function runFlow(page, outDir, { mobile }) {
  mkdirSync(outDir, { recursive: true });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  // 1) RESEARCH view: wait for the candle chart canvas + quote panel.
  await page.waitForSelector("text=QUOTE · AAPL", { timeout: 30000 });
  await page.waitForSelector("canvas", { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/1-research.png`, fullPage: true });

  // 2) MARKET view (indices + VIX + movers).
  await page.keyboard.press("2");
  await page.waitForSelector("text=TODAY'S MOVERS", { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${outDir}/2-market.png`, fullPage: true });

  // 3) PORTFOLIO view (keyboard nav — single-key view switching still works
  // regardless of viewport since it's not gated by the visible nav/BottomNav).
  // The equity curve only renders when the portfolio has holdings; accept the
  // empty state.
  await page.keyboard.press("3");
  await page.waitForSelector("text=/EQUITY CURVE|No holdings yet/", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/3-portfolio.png`, fullPage: true });

  // 3b) PAPER TRADE view.
  await page.keyboard.press("4");
  await page.waitForSelector("text=PAPER CASH", { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/3b-paper.png`, fullPage: true });

  // 4) SCENARIO LAB. The default portfolio starts empty (only the demo tab
  // has seed holdings), so accept either the populated or empty-state copy.
  await page.keyboard.press("5");
  await page.waitForSelector("text=/ESTIMATED IMPACT|nothing to stress test/", { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/4-scenario.png`, fullPage: true });

  // 5) Command palette via keyboard shortcut (works at every viewport).
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[cmdk-dialog]", { timeout: 10000 });
  await page.keyboard.type("NV");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/5-palette.png` });
  await page.keyboard.press("Escape");

  // 6) Alerts view (notifications from the live loop).
  await page.keyboard.press("6");
  await page.waitForSelector("text=ARMED RULES", { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/6-alerts.png`, fullPage: true });

  // 7) Floating advisor chat bubble (bottom-right) — confirms it clears the
  // BottomNav on mobile instead of overlapping it.
  await page.keyboard.press("1");
  await page.waitForSelector("text=QUOTE", { timeout: 15000 });
  await page.click('button[aria-label="Open advisor chat"]');
  await page.waitForSelector("text=Ask about any stock", { timeout: 10000 });
  await page.screenshot({ path: `${outDir}/7-chat-widget.png` });
  await page.click('button[aria-label="Close chat"]');

  if (mobile) {
    // 8) Tap the BottomNav directly (proves it renders and is tappable, not
    // just that the keyboard shortcut still switches views).
    await page.click('[data-tour="nav-mobile"] >> text=MARKET');
    await page.waitForSelector("text=TODAY'S MOVERS", { timeout: 15000 });
    await page.screenshot({ path: `${outDir}/8-bottomnav-tap.png`, fullPage: true });

    // 9) Tap the icon-only mobile search button (proves the Ctrl+K entry
    // point has a real tap target now, not just the keyboard shortcut).
    await page.click('[data-tour="search"]');
    await page.waitForSelector("[cmdk-dialog]", { timeout: 10000 });
    await page.screenshot({ path: `${outDir}/9-search-tap.png` });
    await page.keyboard.press("Escape");
  }

  return errors;
}

const browser = await chromium.launch({ channel: "msedge", headless: true });
let allErrors = [];
for (const vp of VIEWPORTS) {
  const outDir = `smoke-shots/${vp.label}`;
  const page = await (
    await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
  ).newPage();
  console.log(`\n--- ${vp.label} (${vp.width}x${vp.height}) ---`);
  // md (768px) is the shell's own breakpoint for switching to desktop chrome
  // (header nav, no BottomNav) — only run the mobile-only taps below it.
  const errors = await runFlow(page, outDir, { mobile: vp.width < 768 });
  console.log("console errors:", errors.length ? errors : "none");
  allErrors = allErrors.concat(errors);
  await page.close();
}
await browser.close();
process.exit(allErrors.length ? 1 : 0);
