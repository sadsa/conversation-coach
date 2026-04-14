// lib/leitner.ts

export const LEITNER_INTERVALS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 28,
}

export function leitnerPass(currentBox: number, today: Date): { box: number; dueDate: Date } {
  const newBox = Math.min(currentBox + 1, 5)
  const dueDate = new Date(today)
  dueDate.setDate(today.getDate() + LEITNER_INTERVALS[newBox])
  return { box: newBox, dueDate }
}

export function leitnerFail(today: Date): { box: number; dueDate: Date } {
  const dueDate = new Date(today)
  dueDate.setDate(today.getDate() + 1)
  return { box: 1, dueDate }
}

export function formatDateISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
