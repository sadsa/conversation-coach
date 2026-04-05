'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { PracticeList } from '@/components/PracticeList'
import { useTranslation } from '@/components/LanguageProvider'
import { SUB_CATEGORIES } from '@/lib/types'
import type { PracticeItem, SubCategory } from '@/lib/types'

function PracticeSuspenseFallback() {
  const { t } = useTranslation()
  return <p className="text-text-tertiary text-sm">{t('practice.loading')}</p>
}

function PracticePageInner() {
  const { t } = useTranslation()
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

  if (loading) return <p className="text-text-tertiary text-sm">{t('practice.loading')}</p>
  if (error) return <p className="text-red-400 text-sm">{t('practice.error', { msg: error })}</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('practice.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">
          {items.length === 1
            ? t('practice.subtitle', { n: items.length })
            : t('practice.subtitlePlural', { n: items.length })}
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
    <Suspense fallback={<PracticeSuspenseFallback />}>
      <PracticePageInner />
    </Suspense>
  )
}
