/**
 * Form Label in Name Accessibility Scanner Plugin
 *
 * This plugin specifically catches improper ARIA overrides on form controls with <label> elements.
 * It validates that when a form control has an associated <label>, and the accessible name is
 * overridden with aria-label or aria-labelledby, the override still includes the label text.
 *
 * Checks: inputs, selects, textareas, checkboxes, radios, and custom form controls with labels
 *
 * Limitations:
 * - Does NOT verify if the <label> text is actually visible (could be hidden, off-screen, etc.)
 * - Does NOT check if an alternative visible label (like a heading) has been used
 * - Only detects violations when aria-label/aria-labelledby differs from the <label> text
 * - If the label is properly associated without ARIA overrides, this check passes automatically
 *
 * WCAG Criteria: 2.5.3 Label in Name (Level A)
 */

export default async function formLabelInNameScan({ page, addFinding } = {}) {
  const url = page.url();

  // Target form controls that can have associated labels
  const selectors = [
    'input:not([type="hidden"])',
    "select",
    "textarea",
    '[role="textbox"]',
    '[role="combobox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="searchbox"]',
    '[role="spinbutton"]',
  ];

  try {
    const violations = await page.evaluate((selectorList) => {
      const findings = [];

      // Helper to normalise text for comparison
      const normaliseText = (text) => text.toLowerCase().replace(/\s+/g, " ").trim();

      // Helper to find associated label text
      const findLabelText = (element) => {
        let labelText = "";

        // Method 1: Label with 'for' attribute pointing to this element's ID
        if (element.id) {
          const labelElement = document.querySelector(`label[for="${element.id}"]`);
          if (labelElement) {
            labelText = labelElement.textContent.trim();
          }
        }

        // Method 2: Element wrapped in a label (if not found via 'for')
        if (!labelText) {
          const parentLabel = element.closest("label");
          if (parentLabel) {
            // Get label text excluding the form control's own text
            const clonedLabel = parentLabel.cloneNode(true);
            const controlsInLabel = clonedLabel.querySelectorAll("input, select, textarea, [role]");
            controlsInLabel.forEach((control) => control.remove());
            labelText = clonedLabel.textContent.trim();
          }
        }

        return labelText;
      };

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

        // For form controls, the label association provides the accessible name
        const labelText = findLabelText(element);
        if (labelText) {
          return labelText;
        }

        // Try title attribute as fallback
        if (element.hasAttribute("title")) {
          return element.getAttribute("title");
        }

        // Try placeholder (though not ideal for accessible names)
        if (element.hasAttribute("placeholder")) {
          return element.getAttribute("placeholder");
        }

        return "";
      };

      selectorList.forEach((selector) => {
        const elements = document.querySelectorAll(selector);

        elements.forEach((element, index) => {
          // Find associated label text (the visible label)
          const labelText = findLabelText(element);

          // Skip if no label element found (element might use aria-label instead)
          if (!labelText) {
            return;
          }

          // Get accessible name (what screen readers announce)
          const accessibleName = getAccessibleName(element);

          // Skip if no accessible name (will be caught by other checks)
          if (!accessibleName) {
            return;
          }

          // Normalise both for comparison
          const normalisedLabel = normaliseText(labelText);
          const normalisedAccessible = normaliseText(accessibleName);

          // Check if label text is included in accessible name (WCAG 2.5.3 requirement)
          if (!normalisedAccessible.includes(normalisedLabel)) {
            const elementDesc = element.tagName.toLowerCase();
            const typeAttr = element.getAttribute("type");
            const roleAttr = element.getAttribute("role");
            const testId = element.getAttribute("data-testid");

            let elementType = elementDesc;
            if (typeAttr) {
              elementType = `${elementDesc}[type="${typeAttr}"]`;
            } else if (roleAttr) {
              elementType = `${elementDesc}[role="${roleAttr}"]`;
            }

            const targetSelector = element.id
              ? `#${element.id}`
              : testId
                ? `[data-testid="${testId}"]`
                : elementType;

            findings.push({
              elementType,
              labelText,
              accessibleName,
              elementId: element.id || "(no id)",
              selector,
              selectorIndex: index,
              targetSelector,
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
        scannerType: "form-label-in-name-scan",
        url,
        problemShort: `Form label text "${violation.labelText}" not included in accessible name "${violation.accessibleName}"`,
        problemUrl: "https://www.w3.org/WAI/WCAG21/Understanding/label-in-name.html",
        solutionShort: "Ensure the form control's accessible name includes the label text",
        solutionLong: `The ${violation.elementType} form control (id="${violation.elementId}") has a <label> with text "${violation.labelText}" but its accessible name is "${violation.accessibleName}". WCAG 2.5.3 Label in Name (Level A) requires that when form controls have a visible text label, the accessible name must include that label text. This ensures that voice control users can activate the form control by speaking the visible label. If using aria-label or aria-labelledby, ensure it includes "${violation.labelText}". Ideally, the label text should be at the start of the accessible name for best compatibility with voice control software like Apple Voice Control.\n\nTARGET_SELECTOR: \`${violation.selector}\`\nTARGET_INDEX: ${violation.selectorIndex}`,
      });
    }
  } catch (e) {
    console.error("Error scanning form label in name:", e);
  }
}

export const name = "form-label-in-name-scan";
