import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterBar } from '@/components/FilterBar'

const options = [
  { value: 'unstudied', label: 'Unstudied' },
  { value: 'due', label: 'Due' },
  { value: 'studied', label: 'Studied' },
]

function setup(props?: Partial<Parameters<typeof FilterBar>[0]>) {
  const onSearchChange = vi.fn()
  const onFilterAdd = vi.fn()
  const onFilterRemove = vi.fn()
  render(
    <FilterBar
      searchQuery=""
      filterOptions={options}
      activeFilters={[]}
      onSearchChange={onSearchChange}
      onFilterAdd={onFilterAdd}
      onFilterRemove={onFilterRemove}
      {...props}
    />,
  )
  return { onSearchChange, onFilterAdd, onFilterRemove }
}

describe('FilterBar — search', () => {
  it('renders the search input', () => {
    setup()
    expect(screen.getByTestId('filter-search-input')).toBeDefined()
  })

  it('calls onSearchChange when the user types', async () => {
    const { onSearchChange } = setup()
    await userEvent.type(screen.getByTestId('filter-search-input'), 'mer')
    expect(onSearchChange).toHaveBeenCalled()
  })
})

describe('FilterBar — dropdown', () => {
  it('renders the filter trigger button', () => {
    setup()
    expect(screen.getByTestId('filter-dropdown-trigger')).toBeDefined()
  })

  it('shows dropdown options on click', async () => {
    setup()
    await userEvent.click(screen.getByTestId('filter-dropdown-trigger'))
    expect(screen.getByTestId('filter-option-unstudied')).toBeDefined()
    expect(screen.getByTestId('filter-option-due')).toBeDefined()
    expect(screen.getByTestId('filter-option-studied')).toBeDefined()
  })

  it('calls onFilterAdd when an option is selected', async () => {
    const { onFilterAdd } = setup()
    await userEvent.click(screen.getByTestId('filter-dropdown-trigger'))
    await userEvent.click(screen.getByTestId('filter-option-unstudied'))
    expect(onFilterAdd).toHaveBeenCalledWith('unstudied')
  })

  it('closes dropdown after selecting an option', async () => {
    setup()
    await userEvent.click(screen.getByTestId('filter-dropdown-trigger'))
    await userEvent.click(screen.getByTestId('filter-option-unstudied'))
    expect(screen.queryByTestId('filter-dropdown')).toBeNull()
  })

  it('hides already-active filters from dropdown', () => {
    setup({ activeFilters: ['unstudied'] })
    fireEvent.click(screen.getByTestId('filter-dropdown-trigger'))
    expect(screen.queryByTestId('filter-option-unstudied')).toBeNull()
    expect(screen.getByTestId('filter-option-due')).toBeDefined()
  })

  it('hides the trigger button when all options are active', () => {
    setup({ activeFilters: ['unstudied', 'due', 'studied'] })
    expect(screen.queryByTestId('filter-dropdown-trigger')).toBeNull()
  })
})

describe('FilterBar — pills', () => {
  it('renders a pill for each active filter', () => {
    setup({ activeFilters: ['unstudied', 'due'] })
    expect(screen.getByTestId('filter-pill-unstudied')).toBeDefined()
    expect(screen.getByTestId('filter-pill-due')).toBeDefined()
  })

  it('does not render pills when no filters active', () => {
    setup({ activeFilters: [] })
    expect(screen.queryByTestId('filter-pills')).toBeNull()
  })

  it('calls onFilterRemove when the pill dismiss button is clicked', async () => {
    const { onFilterRemove } = setup({ activeFilters: ['unstudied'] })
    await userEvent.click(screen.getByTestId('filter-pill-remove-unstudied'))
    expect(onFilterRemove).toHaveBeenCalledWith('unstudied')
  })
})
