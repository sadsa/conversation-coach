import { NextResponse } from 'next/server'
import { fetchInsightsData } from '@/lib/insights'

export async function GET() {
  const data = await fetchInsightsData()
  return NextResponse.json(data)
}
