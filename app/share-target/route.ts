import { redirect } from 'next/navigation'

// Handles the share target POST on first share (before SW is installed).
// The SW intercepts this route on all subsequent shares.
export async function POST() {
  redirect('/')
}
