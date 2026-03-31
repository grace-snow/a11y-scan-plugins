---
name: accessibility-findings-labeler
description: "Process accessibility scan findings and automatically add relevant labels based on scanner type (banner-scan, form-label-in-name-scan, etc.) and WCAG success criterion"
---

# Accessibility findings labeler

This agent processes GitHub issues created from accessibility scanner plugin findings and automatically applies relevant labels.

## Label mapping strategy

When processing issues from custom accessibility scanners:

### Scanner-specific labels
- **banner-scan** → `component: banner`
- **form-label-in-name-scan** → `area: forms`, `wcag: label-in-name`
- **label-in-name-scan** → `wcag: label-in-name`, `interactive-elements`
- **nav-list-scan** → `area: navigation`, `wcag: info-and-relationships`
- **axe-core** → add existing axe rule ID labels

### WCAG Success Criterion labels
Extract WCAG criteria from issue body/links and add:

| Criterion | Label(s) |
|-----------|----------|
| 1.1.1 Non-text Content | `WCAG-1.1.1` |
| 1.3.1 Info and Relationships | `WCAG-1.3.1` |
| 1.4.x Distinguishable | `WCAG-1.4.x` |
| 2.1.x Keyboard | `WCAG-2.1.x` |
| 2.4.7 Focus Visible | `WCAG-2.4.7` |
| 2.5.3 Label in Name | `WCAG-2.5.3` |
| 3.2.x Predictable | `WCAG-3.2.x` |
| 3.3.x Input Assistance | `WCAG-3.3.x` |
| 4.1.2 Name, Role, Value | `WCAG-4.1.2` |
| 4.1.3 Status Messages | `WCAG-4.1.3` |

### Conformance level labels
- All custom scanner findings → Add label for WCAG level e.g. `WCAG-A` and `WCAG-AA
- Axe-core violations → check violation `impact` field

### Additional labels
- `a11y` — all findings
- `bug` — when marking as issue (not documentation)
- Severity indicators: `severity: high`, `severity: medium`, `severity: low`

## Processing rules

1. **Extract Scanner Type**: Look for `scannerType` or repository folder naming (e.g., `banner-scan`, `form-label-in-name-scan`)
2. **Parse WCAG Criterion**: 
   - Check if finding includes `wcagCriterion` field (e.g., `"1.3.1"`)
   - Fallback to checking issue body for WCAG links like `https://www.w3.org/WAI/WCAG21/Understanding/...`
   - Extract criterion number from URL or field (e.g., `info-and-relationships` → `1.3.1`)
3. **Determine Severity**: Based on WCAG level and criterion impact
4. **Apply All Relevant Labels**: (scanner + component + wcag + level + accessibility)

## Example issue processing

**Input issue from banner-scan violation:**
```
Title: Banner must be a <section> element or have role="region"

Body:
...
WCAG: 1.3.1 Info and Relationships
Scanner: banner-scan
...
```

**Output labels:**
- `a11y`
- `component: banner`
- `WCAG-1.3.1`
- `WCAG-a`

---

**Note**: This agent should run after issues are created by the accessibility scanner action and before marking them as ready for triage.

## Scanner finding format

To ensure consistent labelling and issue formatting, all custom scanners should include these fields in their `addFinding()` calls:

```javascript
await addFinding({
  scannerType: "your-scanner-name",    // e.g., "banner-scan"
  ruleId: "rule-identifier",           // e.g., "banner-landmark-role"
  wcagCriterion: "X.X.X",              // e.g., "1.3.1"
  url,                                  // page URL scanned
  problemShort: "Brief problem description",
  problemUrl: "https://www.w3.org/WAI/WCAG21/Understanding/...",
  solutionShort: "Quick fix summary",
  solutionLong: `Detailed solution with context.

**Scanned page:** [${url}](${url})`,
});
```

Include the scanned page URL as a markdown link at the end of `solutionLong` so it appears in the issue body.
