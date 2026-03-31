/**
 * GitHub Banner Component Accessibility Scanner Plugin
 *
 * This plugin validates that Banner components follow GitHub's accessibility patterns:
 * - Section landmark (role="region" or <section>) with accessible name
 * - Decorative icons marked with aria-hidden="true"
 *
 * WCAG Criteria: 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value, 1.1.1 Non-text Content
 */

export default async function bannerScan({ page, addFinding } = {}) {
  const url = page.url();
  console.log("[banner-scan] Starting scan on:", url);

  // Find all Banner components (production: <banner>, test: [data-testid="banner"])
  const selector = 'banner, [data-testid="banner"]';

  try {
    // Evaluate the page passing in the selector variable as bannerSelectors
    const banners = await page.evaluate((bannerSelectors) => {
      const elements = Array.from(document.querySelectorAll(bannerSelectors));

      return elements.map((banner, index) => {
        const tagName = banner.tagName.toLowerCase();
        const testId = banner.getAttribute("data-testid");
        const roleAttr = banner.getAttribute("role");
        const ariaLabel = banner.getAttribute("aria-label");
        const ariaLabelledby = banner.getAttribute("aria-labelledby");

        // Get accessible name
        let accessibleName = null;
        if (ariaLabelledby) {
          const labelElement = document.getElementById(ariaLabelledby);
          accessibleName = labelElement ? labelElement.textContent.trim() : null;
        } else if (ariaLabel) {
          accessibleName = ariaLabel;
        }

        // Check for icon
        const svg = banner.querySelector("svg");
        const svgAriaHidden = svg ? svg.getAttribute("aria-hidden") : null;

        // Determine computed role
        const computedRole = roleAttr || (tagName === "section" ? "region" : null);

        // Build selector string for reporting
        let selectorStr = tagName;
        if (testId) {
          selectorStr = `${tagName}[data-testid="${testId}"]`;
        }

        return {
          index,
          selector: selectorStr,
          tagName,
          roleAttr,
          computedRole,
          accessibleName,
          hasSvg: !!svg,
          svgAriaHidden,
        };
      });
    }, selector);

    console.log(`[banner-scan] Found ${banners.length} banner(s) on ${url}`);

    // First pass: identify exactly which DOM nodes to highlight so screenshots
    // point to the specific failing target (e.g. the offending SVG icon).
    const bannerViolationIndexes = new Set();
    const svgViolationIndexes = new Set();
    for (const banner of banners) {
      if (banner.computedRole !== "region") bannerViolationIndexes.add(banner.index);
      if (banner.computedRole === "region" && !banner.accessibleName)
        bannerViolationIndexes.add(banner.index);
      if (banner.hasSvg && banner.svgAriaHidden !== "true") svgViolationIndexes.add(banner.index);
    }

    if (bannerViolationIndexes.size > 0 || svgViolationIndexes.size > 0) {
      await page.evaluate(
        ({ sel, bannerIndexes, iconIndexes }) => {
          const elements = Array.from(document.querySelectorAll(sel));

          // Highlight banner-level violations.
          for (const idx of bannerIndexes) {
            if (elements[idx]) {
              elements[idx].style.outline = "3px solid red";
              elements[idx].style.outlineOffset = "2px";
            }
          }

          // Highlight icon-level violations on the offending SVG only.
          for (const idx of iconIndexes) {
            const icon = elements[idx]?.querySelector("svg");
            if (icon) {
              icon.style.outline = "3px solid red";
              icon.style.outlineOffset = "2px";
            }
          }
        },
        {
          sel: selector,
          bannerIndexes: Array.from(bannerViolationIndexes),
          iconIndexes: Array.from(svgViolationIndexes),
        },
      );
    }

    // Second pass: file findings
    for (const banner of banners) {
      console.log(`[banner-scan] Checking banner: ${banner.selector}`);

      // Check 1: Must be a section landmark (role="region" or <section>)
      if (banner.computedRole !== "region") {
        console.log(`[banner-scan] VIOLATION: Missing landmark role on ${banner.selector}`);
        await addFinding({
          scannerType: "banner-scan",
          ruleId: "primer_banner-landmark-role",
          wcagCriterion: "1.3.1",
          url,
          problemShort: `Banner must be a section element or have role="region"`,
          problemUrl: "https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html",
          solutionShort:
            'Use &lt;section&gt; element (implicit role) or add explicit role="region"',
          solutionLong: `Primer accessibility requirement: The banner element &lt;${banner.tagName}&gt;${banner.roleAttr ? ` with role="${banner.roleAttr}"` : ""} does not have the correct landmark role. Banner components must use a &lt;section&gt; element (which has an implicit role="region") or have an explicit role="region" attribute to be properly exposed as section landmarks for screen reader users.\n\nTARGET_SELECTOR: \`${selector}\`\nTARGET_INDEX: ${banner.index}\n\n**Scanned page:** [${url}](${url})`,
        });
      }

      // Check 2: Section landmark must have accessible name
      if (banner.computedRole === "region" && !banner.accessibleName) {
        console.log(`[banner-scan] VIOLATION: Missing accessible name on ${banner.selector}`);
        await addFinding({
          scannerType: "banner-scan",
          ruleId: "banner-accessible-name",
          wcagCriterion: "1.3.1",
          url,
          problemShort: "Banner section landmark missing accessible name",

          problemUrl: "https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html",
          solutionShort: "Add aria-label or aria-labelledby to provide context",
          solutionLong: `Primer accessibility requirement: The banner element ${banner.selector} is a section landmark, but does not have an accessible name. Section landmarks (&lt;section&gt; elements or role="region") require aria-label or aria-labelledby to provide context about the banner type (e.g., "Critical alert", "Info notification") for screen reader users.\n\nTARGET_SELECTOR: \`${selector}\`\nTARGET_INDEX: ${banner.index}\n\n**Scanned page:** [${url}](${url})`,
        });
      }

      // Check 3: Decorative icons must have aria-hidden='true'
      if (banner.hasSvg && banner.svgAriaHidden !== "true") {
        console.log(`[banner-scan] VIOLATION: SVG icon missing aria-hidden on ${banner.selector}`);
        await addFinding({
          scannerType: "banner-scan",
          ruleId: "primer_banner-icon-aria-hidden",
          wcagCriterion: "1.1.1",
          url,
          problemShort: 'Banner icon must be marked as decorative with aria-hidden="true"',
          problemUrl: "https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html",
          solutionShort: 'Add aria-hidden="true" to the SVG icon element',
          solutionLong: `Primer accessibility requirement: The banner ${banner.selector} contains an SVG icon without aria-hidden="true". Banner type indicator icons are decorative because the banner type is conveyed through the accessible name and heading. Exposing the icon to screen readers creates redundant announcements. Add aria-hidden="true" to the SVG to hide it from assistive technologies. This relates to WCAG 2.1 Success Criteria 1.1.1 (Non-text Content) and 4.1.2 (Name, Role, Value).\n\nTARGET_SELECTOR: \`${selector}\`\nTARGET_INDEX: ${banner.index}\nTARGET_SELECTOR_MODE: svg\n\n**Scanned page:** [${url}](${url})`,
        });
      }
    }
    console.log(`[banner-scan] Scan complete for ${url}`);
  } catch (e) {
    console.error("Error scanning banner components:", e);
  }
}

export const name = "banner-scan";
