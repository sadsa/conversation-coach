import { describe, it, expectTypeOf } from 'vitest'
import type { Session } from '@/lib/types'

describe('Session type', () => {
  it('accepts lesson as a session_type', () => {
    const s: Session['session_type'] = 'lesson'
    expectTypeOf(s).toEqualTypeOf<'upload' | 'voice_practice' | 'lesson'>()
  })

  it('has a lesson_phrase field', () => {
    expectTypeOf<Session['lesson_phrase']>().toEqualTypeOf<{
      correction: string
      explanation: string
      flashcard_front: string | null
      practice_item_id: string
    } | null | undefined>()
  })
})
