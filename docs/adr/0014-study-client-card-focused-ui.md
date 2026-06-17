# Study client: card-focused UI with hidden controls

The study session (`LessonClient`) was redesigned to put the flashcard at the centre of the screen and remove the persistent transcript and call-controls footer. The coach speaks in the target language throughout; showing a scrolling transcript competed with the card and turned the screen into a chat UI. Showing native-language text on the card would break immersion in a session that is entirely conducted in the target language.

**Interaction model:** swipe right to advance, swipe left to re-drill the previous card. Both directions send a `formatStudyCardAdvance()` signal to keep the coach in sync. On desktop, left/right arrows flank the card. Controls (mute + exit) are hidden by default and revealed by tapping anywhere outside the card — maximising screen real estate for the card and audio visualizer.

**Considered and rejected:** keeping the transcript as a secondary panel (rejected — competes with the card as visual anchor); a flip mechanic showing native language on the front (rejected — breaks target-language immersion); persistent controls footer (rejected — unnecessary chrome on a screen the learner stares at for minutes at a time).
