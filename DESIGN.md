---
name: Conversation Coach
description: A three-step language learning companion — Practise, Review, Study.
colors:
  accent-primary: "oklch(55% 0.2 285)"
  accent-primary-hover: "oklch(50% 0.22 285)"
  accent-chip-bg: "oklch(94% 0.035 285)"
  accent-chip-border: "oklch(62% 0.16 285)"
  accent-chip-text: "oklch(42% 0.14 285)"
  practise-green: "oklch(58% 0.16 150)"
  correction-green: "oklch(48% 0.14 150)"
  status-ready: "oklch(52% 0.14 150)"
  error-text: "oklch(48% 0.18 25)"
  error-surface: "oklch(94% 0.04 25)"
  bg: "oklch(97.5% 0.008 75)"
  surface: "oklch(99.5% 0.003 75)"
  surface-elevated: "oklch(95% 0.01 75)"
  border: "oklch(82% 0.012 75)"
  border-subtle: "oklch(90% 0.008 75)"
  text-primary: "oklch(22% 0.02 265)"
  text-secondary: "oklch(42% 0.015 265)"
  text-tertiary: "oklch(55% 0.01 265)"
  scrim: "oklch(22% 0.025 265 / 0.55)"
  annotation-unreviewed-bg: "oklch(95% 0.06 85)"
  annotation-unreviewed-border: "oklch(55% 0.15 55)"
  annotation-saved-bg: "oklch(94% 0.04 285)"
  annotation-saved-border: "oklch(50% 0.16 285)"
  annotation-written-bg: "oklch(94% 0.04 150)"
  annotation-written-border: "oklch(45% 0.12 150)"
typography:
  display:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "clamp(1.5rem, 4vw, 2.25rem)"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.015em"
    fontFeature: "'kern', 'liga', 'calt'"
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
    fontFeature: "'ss01', 'cv11'"
  label:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.12em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent-primary}"
    textColor: "oklch(98% 0.008 75)"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-primary-hover}"
    textColor: "oklch(98% 0.008 75)"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-saved:
    backgroundColor: "{colors.annotation-saved-bg}"
    textColor: "{colors.accent-chip-text}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  nav-link-active:
    backgroundColor: "{colors.accent-chip-bg}"
    textColor: "{colors.accent-primary}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  nav-link-idle:
    backgroundColor: "transparent"
    textColor: "{colors.text-tertiary}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
---

# Design System: Conversation Coach

## 1. Overview

**Creative North Star: "The Listening Room"**

Conversation Coach is a space you enter to be present with language. Every surface exists to help the practice happen — not to celebrate it, not to gamble with it, not to turn it into a metric. The interface recedes so the conversation fills the room. Where most language apps interrupt the learner with rewards, this one trusts the learner to know when something clicked.

The visual tone is warm and unhurried. Two typefaces carry the register: Source Serif 4 greets the user with the quiet authority of a patient tutor; Hanken Grotesk does the actual work. The palette is a warm canvas with one confidently-placed accent — a grounded violet (Slate Violet) that marks primary actions and annotation states, accompanied by Practise Green on the surfaces where real learning happens (the call, the correction, the studied item). Everything between those two accents is deliberately uncolored.

This system explicitly rejects gamification, productivity-grind aesthetics, and AI-tool visual vocabulary. No streaks. No confetti. No purple-to-cyan gradients. No "Powered by…" seals. The anti-references are Duolingo (playful, reward-driven), generic admin dashboards (grey, utilitarian, sidebar-first), and the AI assistant stock aesthetic (neon-on-dark, glassmorphism as design). The test: if it looks like it could run daily stand-ups, it has drifted.

**Key Characteristics:**
- Warm cream canvas — tinted toward amber (hue 75) at chroma 0.008, low enough to read as neutral but clearly warmer than pure white
- Two-accent vocabulary: Slate Violet for UI actions, Practise Green for learning moments
- Serif display headings over a humanist sans body — bookish authority plus digital legibility
- Flat-by-default elevation — depth via tonal layering, not shadows; the sole exception is the docked sheet's diffuse lift
- Three annotation states (unreviewed/saved/written) with immediately-distinguishable tint + text + underline colour — legible at a glance from arm's length
- Motion is purposeful and minimal — state change, feedback, reveal; never choreography for its own sake

## 2. Colors: The Listening Room Palette

The palette starts from restraint and earns colour where the user is doing real work.

### Primary
- **Slate Violet** (`oklch(55% 0.2 285)`): The primary action colour. Used on the Call button, primary CTAs, navigation active state, chip borders, and annotation-saved state. Its restrained chroma keeps it purposeful without being loud — violet signals "this is what you do next" without shouting.
- **Slate Violet hover** (`oklch(50% 0.22 285)`): Deepens slightly on hover; the increased chroma communicates press-readiness without a hue shift.
- **Violet chip surface** (`oklch(94% 0.035 285)`): Tinted chip backgrounds and the active nav pill surface. High lightness keeps it from dominating; enough violet to confirm the active state at a glance.

### Secondary
- **Practise Green** (`oklch(58% 0.16 150)`): Emerald. The colour of real learning — used on the Call icon tile, the ringing pulse animation, correction underlines, and the annotation-written state. Lower chroma than Slate Violet so it reads as warm rather than urgent.
- **Correction Green** (`oklch(48% 0.14 150)`): Darker, slightly more muted. Used on correction text (an annotation-level label, not a UI action). Sits comfortably alongside body text without competing.

### Tertiary
- **Error Red surface** (`oklch(94% 0.04 25)`) / **text** (`oklch(48% 0.18 25)`): Semantic error state. High-contrast pairing within the same hue family. Not used decoratively.
- **Amber rank badge** (`oklch(70% 0.14 70)`): Used only on the importance badge in the methodology eyebrow. Warm amber reads as "attention, not warning" — distinct from error red and from both main accents.

### Neutral
- **Warm Canvas** (`oklch(97.5% 0.008 75)`): The `--color-bg` document background. Barely tinted — just warm enough to never look clinical.
- **Cloud Surface** (`oklch(99.5% 0.003 75)`): Card and sheet surfaces. Fractionally lighter than the canvas to lift the sheet without a shadow.
- **Elevated Surface** (`oklch(95% 0.01 75)`): Secondary panels, disabled buttons, footer shelves. The third tonal layer.
- **Border** (`oklch(82% 0.012 75)`): Structural dividers on sheets and form controls.
- **Subtle Border** (`oklch(90% 0.008 75)`): Decorative separators, very light dividers.
- **Ink Navy** (`oklch(22% 0.02 265)`): Primary body text. Near-black with a slight navy tilt (hue 265) that pairs with the violet accent without clashing.
- **Mid Slate** (`oklch(42% 0.015 265)`): Secondary text — metadata, descriptions, secondary labels.
- **Cool Tertiary** (`oklch(55% 0.01 265)`): Eyebrows, placeholder text, disabled labels. Passes WCAG AA against all three background neutrals.

### Named Rules
**The Two-Accent Rule.** Slate Violet and Practise Green are the only saturated colours in the UI palette. Violet = action; Green = learning. A new UI element that needs colour should draw from one of these two families, not introduce a third hue. The amber badge is the sole exception and earns its place by its rarity (one badge, one role).

**The Green Gate Rule.** Practise Green appears on surfaces where the user is directly engaging with their own speech: the call tile, the correction mark, the studied annotation. It is forbidden on generic UI actions (save, cancel, back, nav) — those belong to Slate Violet. The gate keeps the colour's meaning legible.

## 3. Typography

**Display Font:** Source Serif 4 (with ui-serif, Georgia fallback)
**Body Font:** Hanken Grotesk (with ui-sans-serif, system-ui fallback)

**Character:** The pairing is intentional contrast — a transitional serif for headings that recalls the quiet authority of a printed textbook, and a humanist sans for UI text that keeps the interface legible and warm. Neither face is from the 2024–25 AI-app monoculture (no Inter, no IBM Plex, no Fraunces). Hanken Grotesk's `ss01` feature swaps the lowercase `a` to an open-bowl form that reads friendlier at body sizes; `cv11` gives a slashed zero for timestamps.

### Hierarchy

- **Display** (Source Serif 4, 500 weight, `text-3xl` / `text-4xl` on md+, leading 1.15, tracking −0.015em): Page H1s — greetings, pillar names (Practise, Review, Study), auth surfaces. Used only for top-level page identity; never for section labels or buttons.
- **Detail Title** (Source Serif 4, 500 weight, `text-2xl` / `text-3xl` on md+, leading 1.15, tracking −0.015em): Secondary screens — session status, speaker identification, transcript title. One tier below Display; the same family at a quieter size.
- **Body** (Hanken Grotesk, 400, 1rem / 1.6 leading): All body copy — annotations, explanations, flashcard content, pipeline narration. Line length capped at ~70ch on prose surfaces.
- **Button / medium emphasis** (Hanken Grotesk, 500, `text-sm` / `text-base`): Button labels, nav links, interactive element labels. Never Source Serif.
- **Eyebrow** (Hanken Grotesk, 600 semibold, 0.6875rem, uppercase, tracking 0.12em, text-tertiary by default): The `<MethodologyEyebrow>` step labels (PRACTISE · REVIEW · STUDY) and section headers. Used sparingly — one eyebrow per surface section maximum.

### Named Rules
**The Serif Gate Rule.** Source Serif 4 is for page titles and session greeting lines only. Button labels, nav items, eyebrows, metadata, annotation text — all Hanken Grotesk. Mixing the display face into UI chrome violates the product register; the Serif is the threshold, not the wallpaper.

**The Eyebrow Ration Rule.** One eyebrow per section, maximum. The `<MethodologyEyebrow>` rail uses uppercase labels deliberately as a navigation system across three named pillars — that's earned. Any new eyebrow should add meaning the surrounding hierarchy can't carry, or it should be cut.

## 4. Elevation

The system is flat by default. Depth is communicated through tonal layering — `bg` → `surface` → `surface-elevated` — not through shadows. The three neutral tiers are close enough to feel continuous; distinct enough to make the docked sheet visibly lift off the page.

The sole exception is the docked sheet (annotation + study correction panels), which carries a single diffuse lift shadow to signal that the sheet floats above the transcript. On mobile the sheet rises from the bottom of the viewport; on desktop it appears as a right-anchored panel. Both use the same shadow.

### Shadow Vocabulary

- **Sheet lift** (`box-shadow: 0 -18px 40px -22px rgba(0,0,0,0.22)` on mobile / `box-shadow: -18px 0 40px -22px rgba(0,0,0,0.15)` on desktop): Applied to `DockedSheet`. Extremely diffuse — almost more of a glow than a shadow. Directional (upward on mobile, leftward on desktop) so it matches the sheet's entry direction. Not used on any other component.
- **Annotation active ring** (`box-shadow: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--annotation-active-ring)` where ring = `oklch(55% 0.2 285)`): The transcript annotation mark that corresponds to the currently-open sheet. A double-ring (gap + ring) so the mark stays visible against any background tint. Applied while the sheet is open; removed on close.

### Named Rules
**The Flat-By-Default Rule.** Every surface is flat at rest. The sheet lift shadow is not a design motif — it is a functional anchor for the one UI layer that genuinely floats above the page content. No card, panel, button, or navigation element should receive a decorative box shadow.

## 5. Components

The feel is warm and unhurried: rounded without being bubbly, transitions that breathe, palette that's friendly without being clinical. Standard affordances throughout — no reinvented scrollbars, no custom selects, no non-standard modals.

### Buttons
Buttons are direct and undecorated. Two display sizes (sm and md); three variants. No border-radius above `rounded-lg` (8px) — the app is a tool, not a toy.

- **Shape:** Gently rounded edges (8px radius, `rounded-lg`).
- **Primary** (`bg-accent-primary`, white text, `px-5 py-3`): Slate Violet fill. The loudest element in any cluster. Used for the primary conversion action on each screen (Call, Save, Retry). Hover: darkens to `accent-primary-hover`. Disabled: desaturated to `surface-elevated` + `text-tertiary` — greyed out, not ghost-violet.
- **Secondary** (`bg-surface`, `border-border`, `text-text-secondary`, `px-5 py-3`): Stroke + light surface. Always one tier quieter than primary in the same cluster. Hover: surface elevates, text goes primary.
- **Saved** (`bg-annotation-saved-bg`, `border-annotation-saved-border`, violet text): Confirmation state — "already done." Hover is intentionally static (no colour shift) so the button doesn't invite re-clicking something that can't be undone.

### Annotation Marks
The most distinctive component in the system. Inline `<mark>` elements inside the transcript, carrying one of three states. States must be immediately distinguishable at arm's length.

- **Unreviewed** (amber bg `oklch(95% 0.06 85)`, amber underline `oklch(55% 0.15 55)`, amber text `oklch(42% 0.1 55)`): An annotation the user has not yet actioned. Warm amber reads as "worth noticing" — not error-red, not settled-violet.
- **Saved** (violet bg `oklch(94% 0.04 285)`, violet underline `oklch(50% 0.16 285)`, violet text `oklch(35% 0.14 285)`): Added to the Study queue. Violet confirms the annotation belongs to the Slate Violet action family — it's been stored.
- **Written** (emerald bg `oklch(94% 0.04 150)`, emerald underline `oklch(45% 0.12 150)`, emerald text `oklch(30% 0.1 150)`): Marked as studied. Practise Green — the annotation has crossed from saved to learnt.
- **Active ring** (2px gap + 4px Slate Violet ring, `border-radius: 4px`): Overlaid while the corresponding sheet is open. Keeps the user's place in the transcript while reading the correction panel.

### DockedSheet
The correction/study panel. Mobile: slides up from the bottom of the viewport (80vh max-height), covers the bottom nav, rounded top corners (16px). Desktop: right-anchored full-height panel (400px), enters from the right, no scrim.

- **Surface:** `bg-surface` — one tier above the page canvas.
- **Mobile shadow:** `0 -18px 40px -22px rgba(0,0,0,0.22)` — diffuse lift.
- **Desktop border:** `border-l border-border-subtle` — quiet left divider only.
- **Footer shelf:** `bg-surface-elevated`, `border-t border-border-subtle`. Absorbs iOS safe-area inset on mobile.
- **Drag handle:** 8px × 2px pill (`bg-border opacity-60`), centred at the top of the sheet on mobile.
- **Animation:** `sheet-up` (240ms, `cubic-bezier(0.16, 1, 0.3, 1)`) on mobile; `sheet-in-right` (same easing) on desktop.
- **No scrim on desktop.** The panel accompanies the transcript — dimming the page would prevent the cross-reference the desktop layout is designed for.

### Navigation
Two parallel implementations serving the same structure: inline desktop nav links in `AppHeader`, and a mobile `BottomNav` (z-30).

- **Desktop nav link active:** `bg-accent-chip-bg` (`oklch(94% 0.035 285)`) + `text-accent-primary` (`oklch(55% 0.2 285)`), `rounded-md` (8px), `px-3 py-1.5`. Font: Hanken Grotesk 500 `text-sm`.
- **Desktop nav link idle:** transparent bg, `text-text-tertiary`, hover → `bg-surface-elevated` + `text-text-secondary`.
- **Mobile BottomNav:** Icon + label, active state uses Practise Green or Slate Violet depending on surface affinity (see `NAV_TABS` for per-tab colour assignment).

### Eyebrow
The `<MethodologyEyebrow>` step rail — PRACTISE · REVIEW · STUDY — uses the `.text-eyebrow` class: 0.6875rem, semibold, uppercase, tracking 0.12em, `text-tertiary` by default. The active pillar gets `text-text-secondary`. A small count badge (amber, `oklch(70% 0.14 70)`) sits on the STUDY label when the study queue is non-empty.

### Chips / Tags
Filter pills and annotation-state chips. `bg-accent-chip-bg` (`oklch(94% 0.035 285)`), `border border-accent-chip-border` (`oklch(62% 0.16 285)`), `text-accent-chip-text` (`oklch(42% 0.14 285)`), `rounded-full`. Used for importance indicators, annotation state labels, and UI filter toggles.

## 6. Do's and Don'ts

### Do:
- **Do** use Slate Violet (`oklch(55% 0.2 285)`) for all primary actions and the "add to Study" state. Its visual weight is calibrated to lead; keep it as the loudest UI element on any screen.
- **Do** use Practise Green (`oklch(58% 0.16 150)`) exclusively on surfaces where the user is engaging with their own speech — the Call tile, correction marks, the Written annotation state.
- **Do** use `100dvh` everywhere a full-viewport height is needed. `100vh` produces a phantom scrollbar on mobile when the browser chrome is visible.
- **Do** use `<div>` as the root of every client island. The single `<main id="main-content">` lives in `app/layout.tsx`; nested `<main>` elements break the skip-to-content target and produce invalid HTML.
- **Do** use `text-wrap: balance` on page-level H1s and `text-wrap: pretty` on prose paragraphs.
- **Do** keep Source Serif 4 for display headings only. Never use it in buttons, nav, eyebrows, or data text.
- **Do** use `motion-safe:` prefixed animation classes and `animation-fill-mode: both` on all reveal animations, so reduced-motion users snap to the completed frame rather than seeing blank content.
- **Do** distinguish annotation states (unreviewed / saved / written) with three genuinely different hues — amber, violet, emerald — not just opacity or weight. The state must be readable at a metre.
- **Do** use the `DockedSheet` pattern for all correction-detail panels. Not a modal.

### Don't:
- **Don't** use gamification, streaks, confetti, XP, achievement badges, or congratulatory animations. This is a patient companion, not Duolingo.
- **Don't** use generic admin-dashboard aesthetics: no dense data tables, no utilitarian grey sidebars, no sidebar-first information architecture.
- **Don't** use "AI assistant" visual vocabulary: no neon-on-black, no purple-to-cyan gradient fills, no glowing accents as decoration, no "Powered by Claude…" seals, no glassmorphism as a default.
- **Don't** introduce a third UI accent colour. The Two-Accent Rule is a hard constraint: Slate Violet + Practise Green. New semantic states borrow from one of these two hue families.
- **Don't** render the Source Serif 4 display face in buttons, labels, nav links, eyebrows, error messages, or UI copy of any kind. Serif is for thresholds (greetings, page H1s), not wallpaper.
- **Don't** use decorative box shadows on cards, buttons, or panels. The flat-by-default rule is non-negotiable; the only sanctioned shadow is the docked sheet's diffuse lift.
- **Don't** use `border-left` greater than 1px as a coloured accent stripe on cards or list items. Rewrite with a background tint, a full border, or a leading icon.
- **Don't** apply `gradient text` (`background-clip: text` with a gradient). Single solid colours only.
- **Don't** use a modal as a first thought for any correction or detail panel. `DockedSheet` is the pattern; modals are for destructive confirmations only.
- **Don't** add an eyebrow label above every section by reflex. The `<MethodologyEyebrow>` rail is the deliberate use of this pattern; additional eyebrows must carry information the heading hierarchy cannot.
- **Don't** celebrate the AI. The personas (María, Carlos, etc.) occupy the call; the app chrome brackets it quietly. Any "AI" framing in copy or design is an anti-reference violation.
