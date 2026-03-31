/**
 * GitHub NavList Component Accessibility Scanner Plugin
 *
 * This plugin validates that NavList components follow GitHub's accessibility patterns:
 * - Navigation landmark (<nav> or role="navigation")
 * - If navigation landmark, should also have an accessible name
 *
 * Note: Link accessibility and list structure are already validated by axe-core.
 *
 * WCAG Criteria: 1.3.1 Info and Relationships
 */

export default async function navListScan({ page, addFinding } = {}) {
  const url = page.url();

  // Find all NavList components (production: <nav-list>, test: [data-testid="nav-list"], reforge: [data-testid="repos-sidebar"])
  const selector = 'nav-list, [data-testid="nav-list"], [data-testid="repos-sidebar"]';

  try {
    // Evaluate the page passing in the selector variable as navListSelectors
    const navLists = await page.evaluate((navListSelectors) => {
      const elements = Array.from(document.querySelectorAll(navListSelectors));

      return elements.map((navList, index) => {
        const tagName = navList.tagName.toLowerCase();
        const testId = navList.getAttribute("data-testid");
        const roleAttr = navList.getAttribute("role");
        const ariaLabel = navList.getAttribute("aria-label");
        const ariaLabelledby = navList.getAttribute("aria-labelledby");

        // Check if it's a navigation landmark
        const computedRole = roleAttr || (tagName === "nav" ? "navigation" : null);

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
          hasNavigationRole: computedRole === "navigation",
          ariaLabel,
          ariaLabelledby,
        };
      });
    }, selector);

    // Check each navList for violations
    for (const navList of navLists) {
      // Check: Must use navigation landmark
      if (!navList.hasNavigationRole) {
        await addFinding({
          scannerType: "nav-list-scan",
          url,
          problemShort: `NavList must be a <nav> element or have role="navigation"`,
          problemUrl: "https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html",
          solutionShort: 'Use <nav> element (implicit role) or add explicit role="navigation"',
          solutionLong: `The navigation list element <${navList.tagName}>${navList.roleAttr ? ` with role="${navList.roleAttr}"` : ""} does not have the correct landmark role. Navigation lists must use a <nav> element (which has an implicit role="navigation") or have an explicit role="navigation" attribute to be properly exposed as navigation landmarks for screen reader users. This allows users to quickly find and navigate to the navigation section. This violates WCAG 2.1 Success Criterion 1.3.1 (Info and Relationships).\n\nTARGET_SELECTOR: \`${selector}\`\nTARGET_INDEX: ${navList.index}`,
        });
      }

      // Best practice: Warn if navigation landmark lacks accessible name
      // (Not a violation, but helpful for pages with multiple nav landmarks)
      if (navList.hasNavigationRole && !navList.ariaLabel && !navList.ariaLabelledby) {
        // Note: Scanner doesn't have warnings, so we skip this or could make it a finding
        // For now, we'll skip since it's best practice, not a requirement
        // TODO: Ask Lindsey if there is a way to guide coPilot to mark certain findings as warnings instead of errors / label with 'best practice' or mark as low severity or something like that for non-violations?
      }
    }
  } catch (e) {
    console.error("Error scanning navList components:", e);
  }
}

export const name = "nav-list-scan";
