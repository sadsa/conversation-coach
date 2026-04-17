# Spec: Session Workflow Redesign

**Date:** 2026-04-15
**Status:** Draft

## Problem

After removing the Leitner review system, the app's workflow has become fragmented:

1. The session transcript screen shows annotations, but offers no visual way to distinguish which ones you've saved or written down without tapping each one.
2. The practice items screen shows corrections without any transcript context — you can't tell at a glance where the phrase appeared in conversation.
3. "Mark as written" and "delete" now serve nearly the same purpose, making the swipe gesture model redundant and confusing.
4. The full workflow (review → save → write down) requires navigating between two screens unnecessarily.

## Goals

- Make the session transcript the primary review workspace.
- Make annotation state (unreviewed / saved / written) scannable at a glance.
- Give practice items enough transcript context to be meaningful without navigating back to the session.
- Simplify gesture interactions to reduce accidental actions.

---

## 1. Annotation States on the Session Screen

Annotations on the transcript get three visual states, distinguishable by colour without tapping:

| State | Colour | Condition |
|---|---|---|
| **Unreviewed** | Amber underline | No `practice_item` exists for this annotation |
| **Saved** | Violet highlight + underline | `practice_item` exists, `written_down = false` |
| **Written down** | Green highlight + ✓ badge | `practice_item` exists, `written_down = true` |

### Implementation notes

- All colours must use semantic CSS tokens defined in `globals.css` — no hardcoded hex values — so they remain legible in both light and dark themes. Add tokens for each state (e.g. `--annotation-unreviewed`, `--annotation-saved`, `--annotation-written`) with appropriate values per theme.
- `AnnotatedText` receives `addedAnnotations: Map<annotationId, practiceItemId>` and `writtenAnnotations: Set<annotationId>` (new) to drive colour selection per span.
- `writtenAnnotations` is populated from the session detail API response — add `written_down` to the annotation join in `GET /api/sessions/:id`.

---

## 2. Annotation Modal — Compact Action Row

The full-width "Add to practice" / "Added to practice" button in `AnnotationCard` is replaced with a compact two-icon action row at the bottom of the card.

### Layout

```
[explanation and details]
─────────────────────────────
  Saved          [★]  [✓]
```

- **State hint** (left, small text): "Not saved" / "Saved" / "Written ✓"
- **Star icon button** (right): toggles saved state. Outline when inactive; filled violet when active.
- **Check icon button** (right of star): toggles written-down state. Disabled and dimmed when not yet saved. Filled green when active.

### Behaviour

- Tapping star when inactive → creates `practice_item` (POST `/api/practice-items`), highlight on transcript updates to violet.
- Tapping star when active → deletes `practice_item` (DELETE `/api/practice-items/:id`), highlight reverts to amber.
- Tapping check when saved → marks `written_down = true` (PATCH `/api/practice-items/:id`), highlight updates to green.
- Tapping check when written → marks `written_down = false`, highlight reverts to violet.
- Check button is disabled (opacity 0.3, non-interactive) when not saved.

### Accessibility

Icon buttons must have `aria-label` driven by i18n keys (see Section 5). No visible labels required.

---

## 3. Practice Items Screen

### 3a. Context snippet on list cards

Each `SwipeableItem` card gains a context snippet below the correction line — a short excerpt from the original transcript with the error phrase highlighted.

**Extraction logic:**

```
snippet = segment.text.slice(max(0, start_char - 30), end_char + 30)
```

Prepend `"..."` if `start_char > 30`. Append `"..."` if `end_char + 30 < segment.text.length`. Wrap the error phrase itself (characters `start_char` to `end_char` within the snippet) in an amber-tinted highlight span.

The segment text is not currently returned by `GET /api/practice-items`. The route uses a flat `.select()` with no joins, so this requires a secondary lookup. After fetching practice items, collect distinct `annotation_id` values, query `annotations` for `id, segment_id, start_char, end_char`, then query `transcript_segments` for `id, text`, and merge the results in the route handler before returning. Add `segment_text`, `start_char`, and `end_char` as computed fields on the response object (not DB columns). Legacy items with `annotation_id = null` will have these fields as `null` — the snippet simply does not render.

**Visual style:**

Small (12px), muted italic text, left-bordered line. Sits below the chip row. Consistent in both the list card and the detail modal (modal shows the full segment sentence rather than the clipped snippet).

### 3b. Written-down items hidden by default

- Default list view: `written_down = false` items only. Written items are not shown.
- A **"Written"** filter pill replaces the existing "Not written" pill. When active, the list shows only `written_down = true` items.
- When swipe-right (mark as written) triggers, the item animates out with the same slide + height-collapse animation as delete. It does not stay dimmed.

### 3c. Gesture changes

| Gesture | Previous | New |
|---|---|---|
| Swipe right | Mark as written (item stays, dimmed) | Mark as written (item animates out) |
| Swipe left | Delete | **No action** (removed) |
| Long press | Bulk select | Bulk select (unchanged) |
| Bulk delete | Available | Available (unchanged — only delete path) |

The red swipe-left delete background and its trigger are removed. The `triggerDelete` function remains accessible only via the bulk-select toolbar.

---

## 4. Data / API Changes

### `GET /api/sessions/:id`

Add `written_down` to the annotation join so the session detail response can populate `writtenAnnotations` on the transcript page.

**Response shape addition:**
```ts
writtenAnnotations: string[] // annotation IDs where written_down = true
```

### `GET /api/practice-items`

Add three columns to the explicit `.select()` list: `segment_text`, `start_char`, `end_char`. These come from joining `annotations` → `transcript_segments` via `annotation_id` and `segment_id`.

If `annotation_id` is null on a practice item (legacy items added before this feature), `segment_text` will be null — the snippet simply doesn't render.

### `PATCH /api/practice-items/:id`

No change — already accepts `{ written_down: boolean }`.

### No new DB migrations required.

---

## 5. Internationalisation

All new UI strings must be added to both `en` and `es` locales in `lib/i18n.ts`.

### New keys

| Key | en | es |
|---|---|---|
| `annotation.starAria` | Save this correction | Guardar esta corrección |
| `annotation.unstarAria` | Remove from saved | Quitar de guardados |
| `annotation.markWrittenAria` | Mark as written down | Marcar como escrito |
| `annotation.unmarkWrittenAria` | Unmark as written | Desmarcar como escrito |
| `annotation.stateUnsaved` | Not saved | No guardado |
| `annotation.stateSaved` | Saved | Guardado |
| `annotation.stateWritten` | Written ✓ | Escrito ✓ |
| `practiceList.filterWritten` | Written | Escrito |

### Keys to remove

- `annotation.addToPractice` — replaced by icon row
- `annotation.addedToPractice` — replaced by state hint
- `practiceList.filterNotWritten` — replaced by `practiceList.filterWritten`
- `practiceList.notWrittenDown` — chip no longer shown (default list is already unwritten)
- `practiceList.revealWritten` — swipe-right action label; update value to match new UX if wording needs to change

---

## 6. Theme Compatibility

All annotation highlight colours and new UI states must be defined as semantic CSS custom properties in `globals.css` with both `:root` (light) and `.dark` overrides. Suggested tokens:

```css
--annotation-unreviewed-bg: ...;
--annotation-unreviewed-border: ...;
--annotation-saved-bg: ...;
--annotation-saved-border: ...;
--annotation-written-bg: ...;
--annotation-written-border: ...;
--annotation-written-text: ...;
```

Components reference these tokens via Tailwind arbitrary values or inline styles — never hardcoded colour classes.

---

## Out of Scope

- Linking practice items back to the session screen (not needed — context snippet covers the use case)
- Permanent deletion from the practice screen (bulk delete via long press is sufficient)
- Any new backend pipeline or analysis changes
