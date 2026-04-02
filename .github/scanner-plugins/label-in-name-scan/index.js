/**
 * Label in Name Accessibility Scanner Plugin
 *
 * This plugin validates that interactive elements with visible text follow WCAG 2.5.3 Label in Name.
 * Ensures that the visible text is included in the accessible name, and ideally at the start.
 *
 * Checks: buttons, links, and other interactive elements with visible text
 *
 * Limitations:
 * - Uses innerText to determine "visible text", which filters out display:none and visibility:hidden
 * - Does NOT catch text that is positioned off-screen, clipped with CSS, or otherwise visually hidden
 * - Assumes innerText represents what users actually see, which may not always be accurate
 *
 * WCAG Criteria: 2.5.3 Label in Name (Level A)
 */

export default async function labelInNameScan({ page, addFinding } = {}) {
  const url = page.url();

  // Target interactive elements that typically have visible text
  const selectors = [
    "button",
    "a[href]",
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
  ];

  const normaliseText = (text) => text.toLowerCase().replace(/\s+/g, " ").trim();

  const getAccessibleNameForLocator = async (elementLocator) => {
    try {
      const snapshot = await elementLocator.ariaSnapshot();

      const firstNodeLine = snapshot
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("- "));

      const calculatedAccessibleName = firstNodeLine?.match(/"([^"]*)"/)?.[1]?.trim() || "";

      return normaliseText(calculatedAccessibleName);
    } catch (e) {
      return "";
    }
  };

  try {
    const violations = [];

    for (const selector of selectors) {
      const elementCount = await page.locator(selector).count();

      for (let index = 0; index < elementCount; index++) {
        const locator = page.locator(selector).nth(index);

        const elementData = await locator.evaluate((element) => {
          const visibleText = element.innerText?.trim() || "";
          const elementDesc = element.tagName.toLowerCase();
          const roleAttr = element.getAttribute("role");
          const elementId = element.getAttribute("id");
          const testId = element.getAttribute("data-testid");
          const elementType = roleAttr ? `${elementDesc}[role="${roleAttr}"]` : elementDesc;
          const targetSelector = elementId
            ? `#${elementId}`
            : testId
              ? `[data-testid="${testId}"]`
              : elementType;

          return {
            visibleText,
            elementType,
            targetSelector,
            outerHTML: element.outerHTML.substring(0, 200),
          };
        });

        if (!elementData.visibleText) {
          continue;
        }

        const normalisedVisible = normaliseText(elementData.visibleText);
        const normalisedAccessible = await getAccessibleNameForLocator(locator);

        if (!normalisedAccessible) {
          continue;
        }

        if (!normalisedAccessible.includes(normalisedVisible)) {
          violations.push({
            elementType: elementData.elementType,
            visibleText: elementData.visibleText,
            accessibleName: normalisedAccessible,
            selector,
            selectorIndex: index,
            targetSelector: elementData.targetSelector,
            outerHTML: elementData.outerHTML,
          });
        }
      }
    }

    // Report each violation
    for (const violation of violations) {
      await addFinding({
        scannerType: "label-in-name-scan",
        ruleId: "label-in-name-visible-text-match",
        wcagCriterion: "2.5.3",
        url,
        problemShort: `Visible text not included in accessible name`,
        problemUrl: "https://www.w3.org/WAI/WCAG21/Understanding/label-in-name.html",
        solutionShort: "Ensure the accessible name includes the visible text label",
        solutionLong: `The ${violation.elementType} element has visible text "${violation.visibleText}" but its accessible name is "${violation.accessibleName}". WCAG 2.5.3 Label in Name (Level A) requires that when interactive elements have a visible text label, the accessible name must include that visible text. This ensures that voice control users can activate controls by speaking the visible label. Update the element's accessible name (via aria-label, aria-labelledby, or element content) to include "${violation.visibleText}". Ideally, the visible text should be at the start of the accessible name for best compatibility with voice control software.\n\nTARGET_SELECTOR: \`${violation.selector}\`\nTARGET_INDEX: ${violation.selectorIndex}\n\n**Scanned page:** [${url}](${url})`,
      });
    }
  } catch (e) {
    console.error("Error scanning label in name:", e);
  }
}

export const name = "label-in-name-scan";
