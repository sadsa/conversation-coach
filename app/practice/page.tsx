'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { PracticeList } from '@/components/PracticeList'
import { SUB_CATEGORIES } from '@/lib/types'
import type { PracticeItem, SubCategory } from '@/lib/types'

function PracticePageInner() {
  const [items, setItems] = useState<PracticeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Read sub_category param once on mount and immediately strip from URL
  const rawSubCat = searchParams.get('sub_category')
  const initialSubCategory: SubCategory | undefined =
    rawSubCat && (SUB_CATEGORIES as readonly string[]).includes(rawSubCat)
      ? (rawSubCat as SubCategory)
      : undefined

  useEffect(() => {
    if (rawSubCat) router.replace(pathname)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/practice-items')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setItems(data)
        else setError(data?.error ?? 'Failed to load practice items')
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>
  if (error) return <p className="text-red-400 text-sm">Error: {error}</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Practice Items</h1>
        <p className="text-sm text-gray-400 mt-1">
          {items.length} item{items.length !== 1 ? 's' : ''} across all sessions
        </p>
      </div>
      <PracticeList
        items={items}
        initialSubCategory={initialSubCategory}
        onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
      />
    </div>
  )
}

export default function PracticePage() {
  return (
    <Suspense fallback={<p className="text-gray-500 text-sm">Loading…</p>}>
      <PracticePageInner />
    </Suspense>
  )
}
