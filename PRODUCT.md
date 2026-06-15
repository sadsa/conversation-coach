# Product

## Register

product

## Users

Primary user learning Rioplatense (Argentine) Spanish, plus a small circle of friends. Not a classroom — an ambient daily practice. Three contextual use windows:

- **Practise**: a 5-minute deliberate window — morning, on the bus, wherever there's a spare moment.
- **Review**: a focused daytime reading session after a real-life conversation, working through the Coach's annotations.
- **Study**: the residue — a phrase worth internalising, pulled into a queue for deliberate recall.

The user is an adult learner who already speaks some Spanish and is chasing fluency in a specific register. They are not a beginner picking up alphabet cards; they want nuanced correction and real conversation. They find small text difficult.

## Product Purpose

A three-step learning loop built around real speech: **Practise → Review → Study**.

1. **Practise** (`/`): Hold a voice call with an AI Coach, have a free-form chat, or share a WhatsApp voice note for analysis.
2. **Review** (`/review`): Read the annotated transcript of a session — grammar corrections, naturalness observations — and save the ones worth learning.
3. **Study** (`/write`, kept for URL stability): A personal queue of saved corrections. Launch a Drill to practise a phrase in context; the Coach confirms when it's comfortable.

Success = the user completing the loop repeatedly until real-life conversation feels less effortful.

## Brand Personality

**A patient companion walking with you toward fluency. Calm everywhere; alive on the call.**

The mental model is a patient native-speaking friend who happens to know how to teach — present, warm, quietly competent. They walk alongside the user toward fluency rather than hovering above it. They don't lecture, don't congratulate, don't push. They notice things, narrate the work in the background, and hand the next thing over when the user is ready.

Three working adjectives: **patient, encouraging, spacious.**

Two coexisting voices:
- **App voice** (companion): the chrome, toasts, pipeline narration, post-call review. Calm and quietly competent across every surface. Always "we" / "you"; never "I".
- **Persona voice** (character on call — María, Carlos, etc.): their own register, accent, warmth. The companion brackets the call; the persona occupies it.

Voice patterns to use: narrate the work as a person doing it ("Listening to every word.", "Reading the transcript closely."), greet without announcing ("Welcome back."), recover collaboratively ("Couldn't save that — let's try again.").

Voice patterns to avoid: mechanical celebration, productivity-grind framing ("crush your goals", "build the habit"), therapy-speak, AI-assistant tropes ("As your AI companion…"), apologising for elapsed time.

## Anti-references

- **Duolingo**: no gamification, no streaks, no playful mascots, no "achievement unlocked", no confetti, no XP.
- **Generic admin dashboards**: no dense data tables, no utilitarian grey boxes, no sidebar-first information architecture.
- **Overly playful language apps**: no celebration animations, no emoji-heavy feedback, no quest-log copy.
- **"AI assistant" stock aesthetics**: no neon-on-black, no purple-to-cyan gradients, no glowing accents used as a substitute for design, no "Powered by Claude…".

## Design Principles

1. **Readable first.** The user has noted difficulty with small text. Large, comfortable type. Generous line height. High contrast. Body wrapped to ~70ch. Legibility over density — always.

2. **Scannable corrections.** Annotation states (saved, studied) must be immediately distinguishable at a glance — different tint + underline + text colour per state, legible from a metre away.

3. **Spacious layout.** Breathing room is a feature, not waste. Sections at `space-y-8`; items inside a section at `space-y-3`. Varied rhythm — tight inside groups, generous between them.

4. **Lead with a clear primary tier; secondary options recede.** Each surface establishes an unambiguous lead so the eye sorts it in one pass: the page question/H1, and — where the screen's job is to launch something — the primary action doors, which carry weight (filled icon tile + a one-line blurb). Everything below steps down: shortcuts and seeds (the Speak page's conversation starters) take a lighter treatment — bare icon, no fill — so they read as subordinate to the doors, not as peers competing with them. Colour on a tile carries meaning (violet = primary action, emerald = call), not extra shout.

5. **Informative without lecturing.** Explanations are available but never forced. Let the user pull detail on demand. The pipeline narrates the work; it does not apologise for it.

6. **Stable URLs, evolving vocabulary.** Rename what users see; never rename what bookmarks and deep links depend on. `/write` stays; "Study" is the label. This rule applies to every new surface.

## Accessibility & Inclusion

- WCAG AA minimum contrast on all text and interactive elements.
- Large base text size; the primary user finds small text difficult.
- `font-feature-settings: 'ss01', 'cv11'` on by default (friendlier lowercase `a`, slashed zero). Digit-alignment surfaces opt into `tabular-nums`.
- Reduced-motion respected globally (`animation-duration: 0.01ms` in `prefers-reduced-motion`). All animations use `animation-fill-mode: both` so reduced-motion users snap to a complete teaching frame, not a blank one.
- `100dvh` throughout — never `100vh` — to avoid phantom scrollbar on mobile when browser chrome is visible.
- Single skip-to-content target (`<main id="main-content">` in `app/layout.tsx`). Client islands use `<div>` root.
- Focus trap + `aria-modal` in docked sheets on mobile only; desktop deliberately omits both so AT users can cross-reference the transcript.
