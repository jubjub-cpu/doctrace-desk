import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const port = Number(process.env.DOCUTRACE_TEST_PORT || 4184);
const deployedBaseUrl = process.env.DOCUTRACE_BASE_URL?.trim();
const baseUrl = deployedBaseUrl ? `${deployedBaseUrl.replace(/\/$/, "")}/` : `http://127.0.0.1:${port}/`;
const moduleTarget = process.env.PLAYWRIGHT_MODULE || "playwright";
const moduleSpecifier = /^[A-Za-z]:[\\/]/.test(moduleTarget) ? pathToFileURL(moduleTarget).href : moduleTarget;
const { chromium } = await import(moduleSpecifier);
const desktopScreenshotPath = fileURLToPath(new URL("../docs/screenshots/doctrace-approved-workflow.png", import.meta.url));
const mobileScreenshotPath = fileURLToPath(new URL("../docs/screenshots/doctrace-mobile-workflow.png", import.meta.url));

const server = deployedBaseUrl ? null : spawn(process.execPath, ["tools/static-server.mjs", "--port", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"]
});

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Server startup is expected to take a few short attempts.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Local DocuTrace server did not become ready.");
}

async function completeReview(page) {
  await page.locator("#analyze-packet").click();
  await page.locator("[data-verify]").first().waitFor({ state: "visible" });
  await page.locator("[data-verify]").first().check();
  await page.locator('[data-tab="fields"]').click();
  await page.locator("#fields-reviewed").check();
  assert.equal(await page.locator("#approve-review").isEnabled(), true, "Approval should unlock after evidence review");
  await page.locator("#approve-review").click();
  await page.locator('[data-tab="evidence"]').click();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(50);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await desktop.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(await page.locator("[data-packet]").count(), 2, "Two review packets should render");

  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("skip-link")), true, "First keyboard stop should be the skip link");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => location.hash), "#workspace", "Skip link should target the review workspace");

  await completeReview(page);
  assert.match(await page.locator(".status-line").innerText(), /Approved by human reviewer/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, "Desktop should not overflow horizontally");
  assert.equal(await page.evaluate(() => window.scrollY), 0, "Desktop screenshot should start at the top of the workspace");
  await page.screenshot({ path: desktopScreenshotPath, clip: { x: 0, y: 0, width: 1440, height: 900 } });

  const downloadReady = page.waitForEvent("download");
  await page.locator("#download-summary").click();
  const download = await downloadReady;
  assert.match(download.suggestedFilename(), /doctrace-review\.txt$/);

  await page.locator('[data-packet="harborline-logistics"]').click();
  await page.locator("#analyze-packet").click();
  await page.locator("[data-verify]").first().waitFor({ state: "visible" });
  assert.ok(await page.locator("[data-verify]").count() >= 3, "Second packet should return cited evidence");
  await page.locator("#return-review").click();
  assert.match(await page.locator(".status-line").innerText(), /Returned for clarification/);

  await page.locator("#review-question").fill("ab");
  await page.locator("#analyze-packet").click();
  assert.match(await page.locator("#question-error").innerText(), /at least three characters/);
  await page.locator("#review-question").fill("quantum telemetry");
  await page.locator("#analyze-packet").click();
  await page.getByText("No direct evidence found", { exact: true }).waitFor({ state: "visible" });

  assert.deepEqual(consoleErrors, [], "Desktop browser console should have no errors");
  assert.deepEqual(failedRequests, [], "Desktop workflow should have no failed requests");
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(baseUrl, { waitUntil: "networkidle" });
  const inputHeight = await mobilePage.locator("#review-question").evaluate((element) => element.getBoundingClientRect().height);
  assert.ok(inputHeight < 80, `Mobile question field should remain compact; received ${inputHeight}px`);
  await completeReview(mobilePage);
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, "Mobile should not overflow horizontally");
  await mobilePage.screenshot({ path: mobileScreenshotPath, fullPage: true });
  await mobile.close();

  const errorContext = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const errorPage = await errorContext.newPage();
  await errorPage.route("**/data/packets.json", (route) => route.abort());
  await errorPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await errorPage.getByRole("heading", { name: "The synthetic review packets could not be loaded." }).waitFor({ state: "visible" });
  assert.equal(await errorPage.getByRole("button", { name: "Retry" }).isVisible(), true, "Load error should provide retry control");
  await errorContext.close();

  console.log("DOCUTRACE BROWSER TESTS PASSED");
  console.log(JSON.stringify({
    desktop: { width: 1440, workflow: "approved", keyboard: "skip link passed", overflow: false },
    mobile: { width: 390, workflow: "approved", inputHeight, overflow: false },
    secondPacket: "returned for clarification",
    states: ["loading", "validation", "no evidence", "load error", "approved", "returned"],
    consoleErrors: 0,
    failedRequests: 0,
    target: deployedBaseUrl ? "deployed" : "local"
  }));
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}
