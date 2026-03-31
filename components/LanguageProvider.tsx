'use client'
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { t as tFn, inferUiLanguage } from '@/lib/i18n'
import type { TargetLanguage } from '@/lib/types'
import type { UiLanguage } from '@/lib/i18n'

interface LanguageContextValue {
  targetLanguage: TargetLanguage
  uiLanguage: UiLanguage
  setTargetLanguage: (lang: TargetLanguage) => void
  t: (key: string, replacements?: Record<string, string | number>) => string
}

const defaultContext: LanguageContextValue = {
  targetLanguage: 'es-AR',
  uiLanguage: 'en',
  setTargetLanguage: () => {},
  t: (key, r) => tFn(key, 'en', r),
}

const LanguageContext = createContext<LanguageContextValue>(defaultContext)

interface Props {
  children: ReactNode
  initialTargetLanguage?: TargetLanguage
}

export function LanguageProvider({
  children,
  initialTargetLanguage = 'es-AR',
}: Props) {
  const [targetLanguage, setTargetLanguageState] =
    useState<TargetLanguage>(initialTargetLanguage)
  const uiLanguage = inferUiLanguage(targetLanguage)

  const setTargetLanguage = useCallback((lang: TargetLanguage) => {
    setTargetLanguageState(lang)
    void getSupabaseBrowserClient().auth.updateUser({
      data: { target_language: lang },
    })
  }, [])

  const tBound = useCallback(
    (key: string, replacements?: Record<string, string | number>) =>
      tFn(key, uiLanguage, replacements),
    [uiLanguage]
  )

  return (
    <LanguageContext.Provider
      value={{ targetLanguage, uiLanguage, setTargetLanguage, t: tBound }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation(): LanguageContextValue {
  return useContext(LanguageContext)
}
