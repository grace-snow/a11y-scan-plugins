import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

function setOutput(name, value) {
  const outFile = process.env.GITHUB_OUTPUT;
  if (!outFile) return;
  fs.appendFileSync(outFile, `${name}=${value}\n`);
}

function slugify(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "finding"
  );
}

function extractPageUrl(issueBody) {
  const body = issueBody || "";

  const scanMatch = body.match(/scan found an issue on\s+(https?:\/\/\S+)/i);
  if (scanMatch) return scanMatch[1].replace(/[).,]$/, "");

  const markdownLinkMatch = body.match(/\*\*Scanned page:\*\*\s*\[(https?:\/\/[^\]]+)\]\(/i);
  if (markdownLinkMatch) return markdownLinkMatch[1];

  const genericUrlMatch = body.match(/https?:\/\/[^\s)]+/i);
  if (genericUrlMatch) return genericUrlMatch[0];

  return null;
}

function parseTargetHint(issueTitle, issueBody) {
  const body = issueBody || "";
  const explicitMode = body.match(/TARGET_SELECTOR_MODE:\s*([a-z-]+)/i)?.[1]?.toLowerCase();
  const explicitIndexRaw = body.match(/TARGET_INDEX:\s*(\d+)/i)?.[1];
  const explicitIndex = explicitIndexRaw ? Number.parseInt(explicitIndexRaw, 10) : null;

  // Future-proof: allow plugins to include explicit selector hints in issue content.
  const explicitSelector = body.match(/TARGET_SELECTOR:\s*`([^`]+)`/i);
  if (explicitSelector) {
    return { selector: explicitSelector[1], mode: explicitMode || "element", index: explicitIndex };
  }

  const explicitTarget = body.match(/TARGET_SELECTOR:\s*(.+)$/im);
  if (explicitTarget) {
    return {
      selector: explicitTarget[1].trim(),
      mode: explicitMode || "element",
      index: explicitIndex,
    };
  }

  const bannerSelector = body.match(/The banner\s+([^\s]+)\s+(?:contains|is)/i);
  if (bannerSelector) {
    const selector = bannerSelector[1];
    if (/SVG icon|aria-hidden=\"true\"/i.test(issueTitle) || /SVG icon/i.test(body)) {
      return { selector, mode: "svg" };
    }
    return { selector, mode: "element", index: explicitIndex };
  }

  const formControlId = body.match(/form control \(id=\"([^\"]+)\"\)/i);
  if (formControlId && formControlId[1] && formControlId[1] !== "(no id)") {
    return { selector: `#${formControlId[1]}`, mode: "element" };
  }

  const genericElementType = body.match(
    /The\s+([a-z][a-z0-9-]*(?:\[[^\]]+\])?)\s+element\s+has\s+visible\s+text/i,
  );
  if (genericElementType) {
    return { selector: genericElementType[1], mode: "element" };
  }

  const navTag = body.match(/The navigation list element <([a-z][a-z0-9-]*)>/i);
  if (navTag) {
    return { selector: navTag[1], mode: "element" };
  }

  return { selector: null, mode: "page", index: null };
}

async function captureScreenshot({ page, outputPath, target }) {
  if (!target.selector) {
    await page.screenshot({ path: outputPath, fullPage: true });
    return { kind: "page", selectorUsed: "" };
  }

  let rootLocator;
  let rootCount;
  try {
    const locator = page.locator(target.selector);
    const matchCount = await locator.count();
    if (matchCount === 0) {
      await page.screenshot({ path: outputPath, fullPage: true });
      return { kind: "page", selectorUsed: "" };
    }

    if (Number.isInteger(target.index) && target.index >= 0 && target.index < matchCount) {
      rootLocator = locator.nth(target.index);
    } else {
      rootLocator = locator.first();
    }

    rootCount = await rootLocator.count();
  } catch {
    await page.screenshot({ path: outputPath, fullPage: true });
    return { kind: "page", selectorUsed: "" };
  }

  if (rootCount === 0) {
    await page.screenshot({ path: outputPath, fullPage: true });
    return { kind: "page", selectorUsed: "" };
  }

  if (target.mode === "svg") {
    const icon = rootLocator.locator("svg").first();
    const iconCount = await icon.count();
    if (iconCount > 0) {
      await icon.evaluate((el) => {
        el.style.outline = "3px solid red";
        el.style.outlineOffset = "2px";
      });
      await icon.scrollIntoViewIfNeeded();
      await icon.screenshot({ path: outputPath });
      const selectorUsed = Number.isInteger(target.index)
        ? `${target.selector} (index ${target.index}) svg`
        : `${target.selector} svg`;
      return { kind: "element", selectorUsed };
    }
  }

  await rootLocator.evaluate((el) => {
    el.style.outline = "3px solid red";
    el.style.outlineOffset = "2px";
  });
  await rootLocator.scrollIntoViewIfNeeded();
  await rootLocator.screenshot({ path: outputPath });
  const selectorUsed = Number.isInteger(target.index)
    ? `${target.selector} (index ${target.index})`
    : target.selector;
  return { kind: "element", selectorUsed };
}

async function main() {
  const issueNumber = process.env.ISSUE_NUMBER;
  const issueTitle = process.env.ISSUE_TITLE || "";
  const issueBody = process.env.ISSUE_BODY || "";

  if (!issueNumber) {
    throw new Error("Missing ISSUE_NUMBER.");
  }

  const pageUrl = extractPageUrl(issueBody);
  if (!pageUrl) {
    console.log("Could not determine scanned page URL from issue body; skipping screenshot.");
    setOutput("should_capture", "false");
    return;
  }

  const target = parseTargetHint(issueTitle, issueBody);
  const findingSlug = slugify(issueTitle.replace(/^Accessibility issue:\s*/i, ""));

  const localPath = path.join(".tmp", "screenshots", issueNumber, `${findingSlug}.png`);
  const relativePath = path.posix.join("screenshots", issueNumber, `${findingSlug}.png`);

  fs.mkdirSync(path.dirname(localPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1200 } });

  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });

    const captureResult = await captureScreenshot({
      page,
      outputPath: localPath,
      target,
    });

    setOutput("should_capture", "true");
    setOutput("screenshot_local_path", localPath);
    setOutput("screenshot_relative_path", relativePath);
    setOutput("page_url", pageUrl);
    setOutput("screenshot_kind", captureResult.kind);
    setOutput("selector_used", captureResult.selectorUsed || "");

    console.log(`Saved screenshot: ${localPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
