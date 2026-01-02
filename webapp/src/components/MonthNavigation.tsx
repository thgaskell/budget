import { useMemo } from 'react'
import { getPreviousMonth, getNextMonth } from '@budget/core'
import './MonthNavigation.css'

interface MonthNavigationProps {
  currentMonth: string
  selectedMonth: string
  onMonthChange: (month: string) => void
}

/**
 * Format a month string (YYYY-MM) for display.
 */
function formatMonth(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  const date = new Date(year, monthNum - 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/**
 * Month navigation component with prev/next buttons.
 * Shows the current month with visual indicators for past/current/future.
 */
export function MonthNavigation({
  currentMonth,
  selectedMonth,
  onMonthChange,
}: MonthNavigationProps) {
  const formattedMonth = useMemo(() => formatMonth(selectedMonth), [selectedMonth])

  const handlePrevMonth = () => {
    onMonthChange(getPreviousMonth(selectedMonth))
  }

  const handleNextMonth = () => {
    onMonthChange(getNextMonth(selectedMonth))
  }

  const handleCurrentMonth = () => {
    onMonthChange(currentMonth)
  }

  // Determine if we're viewing a past, current, or future month
  const monthStatus = useMemo(() => {
    if (selectedMonth === currentMonth) return 'current'
    if (selectedMonth < currentMonth) return 'past'
    return 'future'
  }, [selectedMonth, currentMonth])

  const showTodayButton = selectedMonth !== currentMonth
  const showTodayOnLeft = monthStatus === 'future'
  const showTodayOnRight = monthStatus === 'past'

  const todayButton = (
    <button
      className="month-navigation__btn month-navigation__btn--today"
      onClick={handleCurrentMonth}
      aria-label="Go to current month"
    >
      Today
    </button>
  )

  return (
    <div className="month-navigation">
      {/* Fixed-width left placeholder for Today button */}
      <div className="month-navigation__today-slot month-navigation__today-slot--left">
        {showTodayButton && showTodayOnLeft && todayButton}
      </div>

      <button
        className="month-navigation__btn month-navigation__btn--prev"
        onClick={handlePrevMonth}
        aria-label="Previous month"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 12L6 8L10 4" />
        </svg>
      </button>

      <div className="month-navigation__display">
        <span className={`month-navigation__month month-navigation__month--${monthStatus}`}>
          {formattedMonth}
        </span>
        {monthStatus === 'past' && (
          <span className="month-navigation__indicator month-navigation__indicator--past">
            Past
          </span>
        )}
        {monthStatus === 'future' && (
          <span className="month-navigation__indicator month-navigation__indicator--future">
            Future
          </span>
        )}
        {monthStatus === 'current' && (
          <span className="month-navigation__indicator month-navigation__indicator--current">
            Current
          </span>
        )}
      </div>

      <button
        className="month-navigation__btn month-navigation__btn--next"
        onClick={handleNextMonth}
        aria-label="Next month"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4L10 8L6 12" />
        </svg>
      </button>

      {/* Fixed-width right placeholder for Today button */}
      <div className="month-navigation__today-slot month-navigation__today-slot--right">
        {showTodayButton && showTodayOnRight && todayButton}
      </div>
    </div>
  )
}

export default MonthNavigation
