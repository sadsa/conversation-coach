# ADR 0011 — Remove the methodology stepper (MethodologyEyebrow)

**Date:** 2026-06-14  
**Status:** Accepted

## Context

The `<MethodologyEyebrow>` component rendered a numbered 3-step rail (Practise → Review → Study) beneath the H1 on all three main surfaces (`/`, `/review`, `/refine`). It served three jobs:

1. **Teach the numbered sequence** — orient new users to the methodology
2. **Show current position** — active step highlighted in accent
3. **Lock pillars for empty accounts** — dashed/dimmed nodes for Review/Refine until the user had data flowing through them

The BottomNav already handles navigation and active-tab state. On desktop the NavDrawer does the same. The stepper was the only place the locked-pillar signal lived.

## Decision

Remove the stepper entirely from all three surfaces and delete the associated `lockedPillars` prop and `loadEmptyAccountFlags` calls from the page RSCs.

## Rationale

- The app is gated behind an email allowlist. The small set of users who access it are already familiar with the three-step flow; teaching the numbered sequence on every page visit adds no value.
- The locked-pillar concern — that a new user landing on Review/Refine would see a confusing empty state — is already handled by the Review page's empty-state copy ("No conversations yet — start one from the home page…"). The empty state is sufficient onboarding for this user base.
- Desktop usage is marginal; the loss of in-page orientation there is acceptable.
- The `loadEmptyAccountFlags` DB probe on every page load existed solely to drive the locked-pillar state. Removing the stepper eliminates two extra queries per page render.

## Consequences

- `MethodologyEyebrow.tsx` and `nav-tabs.tsx` (`Pillar` type) remain in the codebase but are no longer imported by any page or client island. The component can be deleted in a follow-up if it stays unused.
- The eyebrow test suites in `PractiseClient.test.tsx` and `ReviewClient.test.tsx` were removed.
- If the app is opened to a broader user base in the future, the methodology orientation layer will need to be reintroduced — likely as onboarding copy rather than a persistent stepper on every page.
