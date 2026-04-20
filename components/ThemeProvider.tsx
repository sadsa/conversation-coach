'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { THEME_COLOR, STATUS_BAR_STYLE, type ThemeName } from '@/lib/theme-meta'

type Theme = ThemeName

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
})

/**
 * Mirror the active theme into the system-chrome meta tags so that the
 * Android PWA status bar and the Safari address bar tint to match. iOS PWA
 * standalone reads `apple-mobile-web-app-status-bar-style` only at page
 * load, so this update won't repaint the live system bar — but it leaves
 * the right value in the DOM for the next launch, which is when iOS
 * actually re-reads it. (See lib/theme-meta.ts for the full story.)
 */
function syncThemeMeta(theme: Theme) {
  const themeColor = document.querySelector('meta[name="theme-color"]')
  if (themeColor) themeColor.setAttribute('content', THEME_COLOR[theme])
  const statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
  if (statusBar) statusBar.setAttribute('content', STATUS_BAR_STYLE[theme])
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light')

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored === 'light' || stored === 'dark') setThemeState(stored)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    syncThemeMeta(theme)
  }, [theme])

  function setTheme(t: Theme) {
    setThemeState(t)
    localStorage.setItem('theme', t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
