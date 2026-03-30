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

  try {
    const violations = await page.evaluate((selectorList) => {
      const findings = [];

      // Helper to normalise text for comparison
      const normaliseText = (text) => text.toLowerCase().replace(/\s+/g, " ").trim();

      // Helper to get accessible name from element
      const getAccessibleName = (element) => {
        // Try aria-label first
        if (element.hasAttribute("aria-label")) {
          return element.getAttribute("aria-label");
        }

        // Try aria-labelledby
        if (element.hasAttribute("aria-labelledby")) {
          const ids = element.getAttribute("aria-labelledby").split(/\s+/);
          const labelTexts = ids
            .map((id) => document.getElementById(id)?.textContent?.trim())
            .filter(Boolean);
          if (labelTexts.length > 0) {
            return labelTexts.join(" ");
          }
        }

        // Try title attribute
        if (element.hasAttribute("title")) {
          return element.getAttribute("title");
        }

        // For buttons, use innerText as fallback
        // For links, this is often the accessible name too
        return element.innerText?.trim() || "";
      };

      selectorList.forEach((selector) => {
        const elements = document.querySelectorAll(selector);

        elements.forEach((element, index) => {
          // Get visible text (what the user sees)
          const visibleText = element.innerText?.trim() || "";

          // Skip if no visible text (likely icon-only)
          if (!visibleText) {
            return;
          }

          // Get accessible name (what screen readers announce)
          const accessibleName = getAccessibleName(element);

          // Skip if no accessible name (will be caught by other checks)
          if (!accessibleName) {
            return;
          }

          // Normalise both for comparison
          const normalisedVisible = normaliseText(visibleText);
          const normalisedAccessible = normaliseText(accessibleName);

          // Check if visible text is included in accessible name (WCAG 2.5.3 requirement)
          if (!normalisedAccessible.includes(normalisedVisible)) {
            const elementDesc = element.tagName.toLowerCase();
            const roleAttr = element.getAttribute("role");
            const elementType = roleAttr ? `${elementDesc}[role="${roleAttr}"]` : elementDesc;

            findings.push({
              elementType,
              visibleText,
              accessibleName,
              selector: selector,
              outerHTML: element.outerHTML.substring(0, 200), // Truncate for readability
            });
          }
        });
      });

      return findings;
    }, selectors);

    // Report each violation
    for (const violation of violations) {
      await addFinding({
        scannerType: "label-in-name-scan",
        url,
        problemShort: `Visible text "${violation.visibleText}" not included in accessible name "${violation.accessibleName}"`,
        problemUrl: "https://www.w3.org/WAI/WCAG21/Understanding/label-in-name.html",
        solutionShort: "Ensure the accessible name includes the visible text label",
        solutionLong: `The ${violation.elementType} element has visible text "${violation.visibleText}" but its accessible name is "${violation.accessibleName}". WCAG 2.5.3 Label in Name (Level A) requires that when interactive elements have a visible text label, the accessible name must include that visible text. This ensures that voice control users can activate controls by speaking the visible label. Update the element's accessible name (via aria-label, aria-labelledby, or element content) to include "${violation.visibleText}". Ideally, the visible text should be at the start of the accessible name for best compatibility with voice control software.`,
      });
    }
  } catch (e) {
    console.error("Error scanning label in name:", e);
  }
}

export const name = "label-in-name-scan";
