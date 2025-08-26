'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  endOfMonth,
  endOfYear,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from 'date-fns'
import type { DateRange } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardFooter } from '@/components/ui/card'

export interface RangeCalendarWithPresetsProps {
  value?: DateRange
  onChange?: (value?: DateRange) => void
  className?: string
}

export const RangeCalendarWithPresets = ({ value, onChange, className }: RangeCalendarWithPresetsProps) => {
  const today = useMemo(() => new Date(), [])

  const yesterday = useMemo(() => ({
    from: subDays(today, 1),
    to: subDays(today, 1)
  }), [today])

  const last7Days = useMemo(() => ({
    from: subDays(today, 6),
    to: today
  }), [today])

  const last30Days = useMemo(() => ({
    from: subDays(today, 29),
    to: today
  }), [today])

  const monthToDate = useMemo(() => ({
    from: startOfMonth(today),
    to: today
  }), [today])

  const lastMonth = useMemo(() => ({
    from: startOfMonth(subMonths(today, 1)),
    to: endOfMonth(subMonths(today, 1))
  }), [today])

  const yearToDate = useMemo(() => ({
    from: startOfYear(today),
    to: today
  }), [today])

  const lastYear = useMemo(() => ({
    from: startOfYear(subYears(today, 1)),
    to: endOfYear(subYears(today, 1))
  }), [today])

  const [month, setMonth] = useState(value?.from ?? today)
  const [date, setDate] = useState<DateRange | undefined>(value ?? last7Days)

  useEffect(() => {
    if (value?.from && value?.to) {
      setDate(value)
      setMonth(value.to)
    }
  }, [value])

  const handleSelect = (newDate?: DateRange) => {
    setDate(newDate)
    if (newDate?.to) setMonth(newDate.to)
    onChange?.(newDate)
  }

  return (
    <Card className={['max-w-xs py-4', className].filter(Boolean).join(' ')}>
      <CardContent className='px-4'>
        <Calendar
          mode='range'
          selected={date}
          onSelect={handleSelect}
          month={month}
          onMonthChange={setMonth}
          className='w-full bg-transparent p-0'
        />
      </CardContent>
      <CardFooter className='flex flex-wrap gap-2 border-t px-4 !pt-4'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => handleSelect({ from: today, to: today })}
        >
          Today
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => handleSelect(yesterday)}
        >
          Yesterday
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => handleSelect(last7Days)}
        >
          Last 7 days
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => handleSelect(last30Days)}
        >
          Last 30 days
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => handleSelect(monthToDate)}
        >
          Month to date
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => handleSelect(lastMonth)}
        >
          Last month
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => handleSelect(yearToDate)}
        >
          Year to date
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={() => handleSelect(lastYear)}
        >
          Last year
        </Button>
      </CardFooter>
    </Card>
  )
}

export default RangeCalendarWithPresets
