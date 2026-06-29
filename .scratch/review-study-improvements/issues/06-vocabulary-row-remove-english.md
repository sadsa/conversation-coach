# 06 — Vocabulary row: remove English sentence and rename component

Status: done
PRD: `.scratch/review-study-improvements/PRD.md`

## What this issue covers

Remove the English sentence (`flashcard_front`) from Vocabulary list items and rename the component from `FlashcardRow` to something that reflects its list-context role (e.g. `VocabularyRow`).

## Background

Each Vocabulary Item in the list currently renders via `FlashcardRow`, which shows:
- `flashcard_front` — an English sentence with the target phrase bracketed (top)
- `flashcard_back` — a Spanish sentence with the correct phrase bracketed (bottom)

The English sentence is being removed from the list view. `flashcard_front` remains available and is still used by the Study session card UI — this issue only affects the Vocabulary list.

## Acceptance criteria

- The Vocabulary list renders only `flashcard_back` (the Spanish sentence) for each item
- `flashcard_front` is not rendered anywhere in the Vocabulary list
- The component previously called `FlashcardRow` is renamed — choose a name that reflects it is a vocabulary list row, not a flashcard (e.g. `VocabularyRow`)
- The rename is applied everywhere `FlashcardRow` is imported/used in the list context
- The Study session card UI (`LessonClient` and related components) is not changed — `flashcard_front` continues to be used there
- `VocabularyList` / `WriteList` references are updated to use the renamed component

## Testing

- Component test for the renamed row: assert `flashcard_back` content renders; assert `flashcard_front` content does not render
- Prior art: any existing `FlashcardRow` tests; `WriteList` render tests
