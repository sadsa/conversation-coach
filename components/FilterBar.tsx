'use client'
import { useState, useRef, useEffect } from 'react'
import { Icon } from '@/components/Icon'

export interface FilterOption {
  value: string
  label: string
}

interface Props {
  searchQuery: string
  searchPlaceholder?: string
  filterOptions: FilterOption[]
  activeFilters: string[]
  onSearchChange: (query: string) => void
  onFilterAdd: (value: string) => void
  onFilterRemove: (value: string) => void
  filterButtonLabel?: string
}

export function FilterBar({
  searchQuery,
  searchPlaceholder = 'Search…',
  filterOptions,
  activeFilters,
  onSearchChange,
  onFilterAdd,
  onFilterRemove,
  filterButtonLabel = 'Filter',
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [dropdownOpen])

  const availableOptions = filterOptions.filter(o => !activeFilters.includes(o.value))

  return (
    <div className="space-y-2" data-testid="filter-bar">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            data-testid="filter-search-input"
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary placeholder:text-text-tertiary"
          />
        </div>

        {availableOptions.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(o => !o)}
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
              data-testid="filter-dropdown-trigger"
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border-subtle rounded-lg bg-surface hover:bg-surface-elevated transition-colors text-text-secondary whitespace-nowrap"
            >
              <Icon name="funnel" className="w-4 h-4" />
              {filterButtonLabel}
            </button>

            {dropdownOpen && (
              <div
                role="listbox"
                data-testid="filter-dropdown"
                className="absolute right-0 mt-1 z-10 min-w-[160px] bg-surface border border-border-subtle rounded-xl shadow-lg overflow-hidden"
              >
                {availableOptions.map(option => (
                  <button
                    key={option.value}
                    role="option"
                    aria-selected={false}
                    type="button"
                    data-testid={`filter-option-${option.value}`}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-elevated transition-colors"
                    onClick={() => {
                      onFilterAdd(option.value)
                      setDropdownOpen(false)
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="filter-pills">
          {activeFilters.map(value => {
            const option = filterOptions.find(o => o.value === value)
            if (!option) return null
            return (
              <span
                key={value}
                data-testid={`filter-pill-${value}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-accent-primary/10 text-accent-primary"
              >
                {option.label}
                <button
                  type="button"
                  aria-label={`Remove ${option.label} filter`}
                  data-testid={`filter-pill-remove-${value}`}
                  onClick={() => onFilterRemove(value)}
                  className="ml-0.5 hover:opacity-70 transition-opacity"
                >
                  <Icon name="close" className="w-3 h-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
