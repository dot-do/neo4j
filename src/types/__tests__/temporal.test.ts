import { describe, it, expect } from 'vitest'
import {
  Date as Neo4jDate,
  Time,
  LocalTime,
  DateTime,
  LocalDateTime,
  Duration,
  isDate,
  isTime,
  isLocalTime,
  isDateTime,
  isLocalDateTime,
  isDuration
} from '../temporal'

describe('Date', () => {
  describe('Constructor', () => {
    it('creates Date with year, month, day', () => {
      const d = new Neo4jDate(2024, 3, 15)
      expect(d.year).toBe(2024)
      expect(d.month).toBe(3)
      expect(d.day).toBe(15)
    })

    it('is immutable (frozen)', () => {
      const d = new Neo4jDate(2024, 1, 1)
      expect(Object.isFrozen(d)).toBe(true)
    })
  })

  describe('fromStandardDate', () => {
    it('creates Date from JavaScript Date', () => {
      const jsDate = new globalThis.Date(2024, 2, 15) // March 15, 2024
      const d = Neo4jDate.fromStandardDate(jsDate)
      expect(d.year).toBe(2024)
      expect(d.month).toBe(3)
      expect(d.day).toBe(15)
    })
  })

  describe('toStandardDate', () => {
    it('converts to JavaScript Date at midnight UTC', () => {
      const d = new Neo4jDate(2024, 3, 15)
      const jsDate = d.toStandardDate()
      expect(jsDate.getUTCFullYear()).toBe(2024)
      expect(jsDate.getUTCMonth()).toBe(2) // 0-indexed
      expect(jsDate.getUTCDate()).toBe(15)
      expect(jsDate.getUTCHours()).toBe(0)
      expect(jsDate.getUTCMinutes()).toBe(0)
    })
  })

  describe('toString', () => {
    it('returns ISO date format', () => {
      const d = new Neo4jDate(2024, 3, 15)
      expect(d.toString()).toBe('2024-03-15')
    })

    it('pads month and day with zeros', () => {
      const d = new Neo4jDate(2024, 1, 5)
      expect(d.toString()).toBe('2024-01-05')
    })
  })

  describe('isDate type guard', () => {
    it('returns true for Neo4jDate', () => {
      expect(isDate(new Neo4jDate(2024, 1, 1))).toBe(true)
    })

    it('returns false for JavaScript Date', () => {
      expect(isDate(new globalThis.Date())).toBe(false)
    })

    it('returns false for other types', () => {
      expect(isDate('2024-01-01')).toBe(false)
      expect(isDate(null)).toBe(false)
      expect(isDate(undefined)).toBe(false)
    })
  })
})

describe('LocalTime', () => {
  describe('Constructor', () => {
    it('creates LocalTime with hour, minute, second, nanosecond', () => {
      const t = new LocalTime(14, 30, 45, 123456789)
      expect(t.hour).toBe(14)
      expect(t.minute).toBe(30)
      expect(t.second).toBe(45)
      expect(t.nanosecond).toBe(123456789)
    })

    it('is immutable (frozen)', () => {
      const t = new LocalTime(0, 0, 0, 0)
      expect(Object.isFrozen(t)).toBe(true)
    })
  })

  describe('fromStandardDate', () => {
    it('creates LocalTime from JavaScript Date', () => {
      const jsDate = new globalThis.Date(2024, 0, 1, 14, 30, 45, 123)
      const t = LocalTime.fromStandardDate(jsDate)
      expect(t.hour).toBe(14)
      expect(t.minute).toBe(30)
      expect(t.second).toBe(45)
      expect(t.nanosecond).toBe(123000000) // milliseconds to nanoseconds
    })

    it('accepts optional nanosecond parameter', () => {
      const jsDate = new globalThis.Date(2024, 0, 1, 14, 30, 45)
      const t = LocalTime.fromStandardDate(jsDate, 999999999)
      expect(t.nanosecond).toBe(999999999)
    })
  })

  describe('toString', () => {
    it('returns ISO time format', () => {
      const t = new LocalTime(14, 30, 45, 0)
      expect(t.toString()).toBe('14:30:45')
    })

    it('includes nanoseconds when non-zero', () => {
      const t = new LocalTime(14, 30, 45, 123456789)
      expect(t.toString()).toBe('14:30:45.123456789')
    })

    it('pads components with zeros', () => {
      const t = new LocalTime(9, 5, 3, 1)
      expect(t.toString()).toMatch(/^09:05:03/)
    })
  })

  describe('isLocalTime type guard', () => {
    it('returns true for LocalTime', () => {
      expect(isLocalTime(new LocalTime(0, 0, 0, 0))).toBe(true)
    })

    it('returns false for Time', () => {
      expect(isLocalTime(new Time(0, 0, 0, 0, 0))).toBe(false)
    })
  })
})

describe('Time', () => {
  describe('Constructor', () => {
    it('creates Time with timezone offset', () => {
      const t = new Time(14, 30, 45, 123456789, 3600) // +01:00
      expect(t.hour).toBe(14)
      expect(t.minute).toBe(30)
      expect(t.second).toBe(45)
      expect(t.nanosecond).toBe(123456789)
      expect(t.timeZoneOffsetSeconds).toBe(3600)
    })

    it('is immutable (frozen)', () => {
      const t = new Time(0, 0, 0, 0, 0)
      expect(Object.isFrozen(t)).toBe(true)
    })
  })

  describe('fromStandardDate', () => {
    it('creates Time from JavaScript Date with timezone offset', () => {
      const jsDate = new globalThis.Date(2024, 0, 1, 14, 30, 45, 123)
      const t = Time.fromStandardDate(jsDate)
      expect(t.hour).toBe(14)
      expect(t.minute).toBe(30)
      expect(t.second).toBe(45)
      // timeZoneOffsetSeconds should reflect local timezone
      expect(typeof t.timeZoneOffsetSeconds).toBe('number')
    })
  })

  describe('toString', () => {
    it('returns ISO time format with positive offset', () => {
      const t = new Time(14, 30, 45, 0, 3600)
      expect(t.toString()).toBe('14:30:45+01:00')
    })

    it('returns ISO time format with negative offset', () => {
      const t = new Time(14, 30, 45, 0, -18000) // -05:00
      expect(t.toString()).toBe('14:30:45-05:00')
    })

    it('returns ISO time format with Z for UTC', () => {
      const t = new Time(14, 30, 45, 0, 0)
      expect(t.toString()).toBe('14:30:45Z')
    })

    it('includes nanoseconds when non-zero', () => {
      const t = new Time(14, 30, 45, 123000000, 0)
      expect(t.toString()).toBe('14:30:45.123000000Z')
    })
  })

  describe('isTime type guard', () => {
    it('returns true for Time', () => {
      expect(isTime(new Time(0, 0, 0, 0, 0))).toBe(true)
    })

    it('returns false for LocalTime', () => {
      expect(isTime(new LocalTime(0, 0, 0, 0))).toBe(false)
    })
  })
})

describe('LocalDateTime', () => {
  describe('Constructor', () => {
    it('creates LocalDateTime with all components', () => {
      const dt = new LocalDateTime(2024, 3, 15, 14, 30, 45, 123456789)
      expect(dt.year).toBe(2024)
      expect(dt.month).toBe(3)
      expect(dt.day).toBe(15)
      expect(dt.hour).toBe(14)
      expect(dt.minute).toBe(30)
      expect(dt.second).toBe(45)
      expect(dt.nanosecond).toBe(123456789)
    })

    it('is immutable (frozen)', () => {
      const dt = new LocalDateTime(2024, 1, 1, 0, 0, 0, 0)
      expect(Object.isFrozen(dt)).toBe(true)
    })
  })

  describe('fromStandardDate', () => {
    it('creates LocalDateTime from JavaScript Date', () => {
      const jsDate = new globalThis.Date(2024, 2, 15, 14, 30, 45, 123)
      const dt = LocalDateTime.fromStandardDate(jsDate)
      expect(dt.year).toBe(2024)
      expect(dt.month).toBe(3)
      expect(dt.day).toBe(15)
      expect(dt.hour).toBe(14)
      expect(dt.minute).toBe(30)
      expect(dt.second).toBe(45)
      expect(dt.nanosecond).toBe(123000000)
    })
  })

  describe('toStandardDate', () => {
    it('converts to JavaScript Date', () => {
      const dt = new LocalDateTime(2024, 3, 15, 14, 30, 45, 0)
      const jsDate = dt.toStandardDate()
      expect(jsDate.getFullYear()).toBe(2024)
      expect(jsDate.getMonth()).toBe(2) // 0-indexed
      expect(jsDate.getDate()).toBe(15)
      expect(jsDate.getHours()).toBe(14)
      expect(jsDate.getMinutes()).toBe(30)
      expect(jsDate.getSeconds()).toBe(45)
    })
  })

  describe('toString', () => {
    it('returns ISO datetime format', () => {
      const dt = new LocalDateTime(2024, 3, 15, 14, 30, 45, 0)
      expect(dt.toString()).toBe('2024-03-15T14:30:45')
    })

    it('includes nanoseconds when non-zero', () => {
      const dt = new LocalDateTime(2024, 3, 15, 14, 30, 45, 123456789)
      expect(dt.toString()).toBe('2024-03-15T14:30:45.123456789')
    })
  })

  describe('isLocalDateTime type guard', () => {
    it('returns true for LocalDateTime', () => {
      expect(isLocalDateTime(new LocalDateTime(2024, 1, 1, 0, 0, 0, 0))).toBe(true)
    })

    it('returns false for DateTime', () => {
      expect(isLocalDateTime(new DateTime(2024, 1, 1, 0, 0, 0, 0, 0))).toBe(false)
    })
  })
})

describe('DateTime', () => {
  describe('Constructor', () => {
    it('creates DateTime with timezone offset', () => {
      const dt = new DateTime(2024, 3, 15, 14, 30, 45, 123456789, 3600)
      expect(dt.year).toBe(2024)
      expect(dt.month).toBe(3)
      expect(dt.day).toBe(15)
      expect(dt.hour).toBe(14)
      expect(dt.minute).toBe(30)
      expect(dt.second).toBe(45)
      expect(dt.nanosecond).toBe(123456789)
      expect(dt.timeZoneOffsetSeconds).toBe(3600)
      expect(dt.timeZoneId).toBeUndefined()
    })

    it('creates DateTime with timezone ID', () => {
      const dt = new DateTime(2024, 3, 15, 14, 30, 45, 123456789, undefined, 'America/New_York')
      expect(dt.timeZoneId).toBe('America/New_York')
    })

    it('creates DateTime with both offset and ID', () => {
      const dt = new DateTime(2024, 3, 15, 14, 30, 45, 123456789, -18000, 'America/New_York')
      expect(dt.timeZoneOffsetSeconds).toBe(-18000)
      expect(dt.timeZoneId).toBe('America/New_York')
    })

    it('is immutable (frozen)', () => {
      const dt = new DateTime(2024, 1, 1, 0, 0, 0, 0, 0)
      expect(Object.isFrozen(dt)).toBe(true)
    })
  })

  describe('fromStandardDate', () => {
    it('creates DateTime from JavaScript Date', () => {
      const jsDate = new globalThis.Date(2024, 2, 15, 14, 30, 45, 123)
      const dt = DateTime.fromStandardDate(jsDate)
      expect(dt.year).toBe(2024)
      expect(dt.month).toBe(3)
      expect(dt.day).toBe(15)
      expect(dt.hour).toBe(14)
      expect(dt.minute).toBe(30)
      expect(dt.second).toBe(45)
      expect(typeof dt.timeZoneOffsetSeconds).toBe('number')
    })
  })

  describe('toStandardDate', () => {
    it('converts to JavaScript Date when offset is defined', () => {
      const dt = new DateTime(2024, 3, 15, 14, 30, 45, 0, 0) // UTC
      const jsDate = dt.toStandardDate()
      expect(jsDate.getUTCFullYear()).toBe(2024)
      expect(jsDate.getUTCMonth()).toBe(2)
      expect(jsDate.getUTCDate()).toBe(15)
      expect(jsDate.getUTCHours()).toBe(14)
      expect(jsDate.getUTCMinutes()).toBe(30)
    })
  })

  describe('toString', () => {
    it('returns ISO datetime format with offset', () => {
      const dt = new DateTime(2024, 3, 15, 14, 30, 45, 0, 3600)
      expect(dt.toString()).toBe('2024-03-15T14:30:45+01:00')
    })

    it('returns ISO datetime format with Z for UTC', () => {
      const dt = new DateTime(2024, 3, 15, 14, 30, 45, 0, 0)
      expect(dt.toString()).toBe('2024-03-15T14:30:45Z')
    })

    it('includes timezone ID when present', () => {
      const dt = new DateTime(2024, 3, 15, 14, 30, 45, 0, -18000, 'America/New_York')
      expect(dt.toString()).toMatch(/America\/New_York/)
    })

    it('includes nanoseconds when non-zero', () => {
      const dt = new DateTime(2024, 3, 15, 14, 30, 45, 123456789, 0)
      expect(dt.toString()).toContain('.123456789')
    })
  })

  describe('isDateTime type guard', () => {
    it('returns true for DateTime', () => {
      expect(isDateTime(new DateTime(2024, 1, 1, 0, 0, 0, 0, 0))).toBe(true)
    })

    it('returns false for LocalDateTime', () => {
      expect(isDateTime(new LocalDateTime(2024, 1, 1, 0, 0, 0, 0))).toBe(false)
    })
  })
})

describe('Duration', () => {
  describe('Constructor', () => {
    it('creates Duration with all components', () => {
      const d = new Duration(12, 30, 3600, 500000000)
      expect(d.months).toBe(12)
      expect(d.days).toBe(30)
      expect(d.seconds).toBe(3600)
      expect(d.nanoseconds).toBe(500000000)
    })

    it('is immutable (frozen)', () => {
      const d = new Duration(0, 0, 0, 0)
      expect(Object.isFrozen(d)).toBe(true)
    })
  })

  describe('toString', () => {
    it('returns ISO 8601 duration format', () => {
      const d = new Duration(14, 16, 10015, 0)
      expect(d.toString()).toBe('P14M16DT10015S')
    })

    it('handles zero values', () => {
      const d = new Duration(0, 0, 0, 0)
      expect(d.toString()).toBe('P0M0DT0S')
    })

    it('includes nanoseconds when non-zero', () => {
      const d = new Duration(0, 0, 1, 500000000)
      expect(d.toString()).toBe('P0M0DT1.500000000S')
    })

    it('handles negative values', () => {
      const d = new Duration(-1, -5, -3600, 0)
      expect(d.toString()).toBe('P-1M-5DT-3600S')
    })
  })

  describe('isDuration type guard', () => {
    it('returns true for Duration', () => {
      expect(isDuration(new Duration(0, 0, 0, 0))).toBe(true)
    })

    it('returns false for other types', () => {
      expect(isDuration({ months: 0, days: 0, seconds: 0, nanoseconds: 0 })).toBe(false)
      expect(isDuration(null)).toBe(false)
    })
  })
})

describe('Edge cases', () => {
  describe('Date edge cases', () => {
    it('handles leap year', () => {
      const d = new Neo4jDate(2024, 2, 29)
      expect(d.toString()).toBe('2024-02-29')
    })

    it('handles year boundaries', () => {
      const d = new Neo4jDate(2024, 12, 31)
      expect(d.toString()).toBe('2024-12-31')
    })
  })

  describe('Time edge cases', () => {
    it('handles midnight', () => {
      const t = new LocalTime(0, 0, 0, 0)
      expect(t.toString()).toBe('00:00:00')
    })

    it('handles 23:59:59.999999999', () => {
      const t = new LocalTime(23, 59, 59, 999999999)
      expect(t.toString()).toBe('23:59:59.999999999')
    })
  })

  describe('DateTime timezone edge cases', () => {
    it('handles maximum positive offset (+14:00)', () => {
      const dt = new DateTime(2024, 1, 1, 0, 0, 0, 0, 50400)
      expect(dt.toString()).toContain('+14:00')
    })

    it('handles maximum negative offset (-12:00)', () => {
      const dt = new DateTime(2024, 1, 1, 0, 0, 0, 0, -43200)
      expect(dt.toString()).toContain('-12:00')
    })

    it('handles half-hour offset', () => {
      const dt = new DateTime(2024, 1, 1, 0, 0, 0, 0, 19800) // +05:30 India
      expect(dt.toString()).toContain('+05:30')
    })

    it('handles 45-minute offset', () => {
      const dt = new DateTime(2024, 1, 1, 0, 0, 0, 0, 20700) // +05:45 Nepal
      expect(dt.toString()).toContain('+05:45')
    })
  })

  describe('Nanosecond precision', () => {
    it('preserves full nanosecond precision', () => {
      const t = new LocalTime(12, 0, 0, 123456789)
      expect(t.nanosecond).toBe(123456789)
    })

    it('handles single nanosecond', () => {
      const t = new LocalTime(12, 0, 0, 1)
      expect(t.nanosecond).toBe(1)
    })
  })
})
