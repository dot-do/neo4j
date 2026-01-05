/**
 * Temporal Types - Neo4j temporal type implementations
 *
 * Compatible with neo4j-driver's temporal types.
 * @see https://neo4j.com/docs/javascript-manual/current/data-types/#temporal-types
 */

/**
 * Seconds per minute
 */
const SECONDS_PER_MINUTE = 60

/**
 * Minutes per hour
 */
const MINUTES_PER_HOUR = 60

/**
 * Seconds per hour
 */
const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR

/**
 * Represents a date without time or timezone information.
 */
export class Date {
  readonly year: number
  readonly month: number
  readonly day: number

  constructor(year: number, month: number, day: number) {
    this.year = year
    this.month = month
    this.day = day
    Object.freeze(this)
  }

  toString(): string {
    const year = String(this.year).padStart(4, '0')
    const month = String(this.month).padStart(2, '0')
    const day = String(this.day).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  static fromStandardDate(standardDate: globalThis.Date): Date {
    return new Date(
      standardDate.getFullYear(),
      standardDate.getMonth() + 1,
      standardDate.getDate()
    )
  }

  toStandardDate(): globalThis.Date {
    return new globalThis.Date(
      globalThis.Date.UTC(this.year, this.month - 1, this.day, 0, 0, 0, 0)
    )
  }
}

/**
 * Represents a local time without timezone information.
 */
export class LocalTime {
  readonly hour: number
  readonly minute: number
  readonly second: number
  readonly nanosecond: number

  constructor(hour: number, minute: number, second: number, nanosecond: number) {
    this.hour = hour
    this.minute = minute
    this.second = second
    this.nanosecond = nanosecond
    Object.freeze(this)
  }

  toString(): string {
    const hour = String(this.hour).padStart(2, '0')
    const minute = String(this.minute).padStart(2, '0')
    const second = String(this.second).padStart(2, '0')

    if (this.nanosecond !== 0) {
      return `${hour}:${minute}:${second}.${String(this.nanosecond).padStart(9, '0')}`
    }
    return `${hour}:${minute}:${second}`
  }

  static fromStandardDate(standardDate: globalThis.Date, nanosecond?: number): LocalTime {
    const ns = nanosecond !== undefined ? nanosecond : standardDate.getMilliseconds() * 1_000_000
    return new LocalTime(
      standardDate.getHours(),
      standardDate.getMinutes(),
      standardDate.getSeconds(),
      ns
    )
  }
}

/**
 * Represents a time with timezone offset.
 */
export class Time {
  readonly hour: number
  readonly minute: number
  readonly second: number
  readonly nanosecond: number
  readonly timeZoneOffsetSeconds: number

  constructor(
    hour: number,
    minute: number,
    second: number,
    nanosecond: number,
    timeZoneOffsetSeconds: number
  ) {
    this.hour = hour
    this.minute = minute
    this.second = second
    this.nanosecond = nanosecond
    this.timeZoneOffsetSeconds = timeZoneOffsetSeconds
    Object.freeze(this)
  }

  toString(): string {
    const hour = String(this.hour).padStart(2, '0')
    const minute = String(this.minute).padStart(2, '0')
    const second = String(this.second).padStart(2, '0')

    let timeStr: string
    if (this.nanosecond !== 0) {
      timeStr = `${hour}:${minute}:${second}.${String(this.nanosecond).padStart(9, '0')}`
    } else {
      timeStr = `${hour}:${minute}:${second}`
    }

    if (this.timeZoneOffsetSeconds === 0) {
      return `${timeStr}Z`
    }

    const sign = this.timeZoneOffsetSeconds < 0 ? '-' : '+'
    const absOffset = Math.abs(this.timeZoneOffsetSeconds)
    const hours = Math.floor(absOffset / SECONDS_PER_HOUR)
    const minutes = Math.floor((absOffset % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)

    return `${timeStr}${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  static fromStandardDate(standardDate: globalThis.Date, nanosecond?: number): Time {
    const ns = nanosecond !== undefined ? nanosecond : standardDate.getMilliseconds() * 1_000_000
    return new Time(
      standardDate.getHours(),
      standardDate.getMinutes(),
      standardDate.getSeconds(),
      ns,
      -standardDate.getTimezoneOffset() * SECONDS_PER_MINUTE
    )
  }
}

/**
 * Represents a local date-time without timezone information.
 */
export class LocalDateTime {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
  readonly nanosecond: number

  constructor(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    nanosecond: number
  ) {
    this.year = year
    this.month = month
    this.day = day
    this.hour = hour
    this.minute = minute
    this.second = second
    this.nanosecond = nanosecond
    Object.freeze(this)
  }

  toString(): string {
    const date = new Date(this.year, this.month, this.day)
    const hour = String(this.hour).padStart(2, '0')
    const minute = String(this.minute).padStart(2, '0')
    const second = String(this.second).padStart(2, '0')

    let timeStr: string
    if (this.nanosecond !== 0) {
      timeStr = `${hour}:${minute}:${second}.${String(this.nanosecond).padStart(9, '0')}`
    } else {
      timeStr = `${hour}:${minute}:${second}`
    }

    return `${date.toString()}T${timeStr}`
  }

  static fromStandardDate(standardDate: globalThis.Date, nanosecond?: number): LocalDateTime {
    const ns = nanosecond !== undefined ? nanosecond : standardDate.getMilliseconds() * 1_000_000
    return new LocalDateTime(
      standardDate.getFullYear(),
      standardDate.getMonth() + 1,
      standardDate.getDate(),
      standardDate.getHours(),
      standardDate.getMinutes(),
      standardDate.getSeconds(),
      ns
    )
  }

  toStandardDate(): globalThis.Date {
    return new globalThis.Date(
      this.year,
      this.month - 1,
      this.day,
      this.hour,
      this.minute,
      this.second,
      Math.floor(this.nanosecond / 1_000_000)
    )
  }
}

/**
 * Represents a date-time with timezone information.
 */
export class DateTime {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
  readonly nanosecond: number
  readonly timeZoneOffsetSeconds?: number
  readonly timeZoneId?: string

  constructor(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    nanosecond: number,
    timeZoneOffsetSeconds?: number,
    timeZoneId?: string
  ) {
    this.year = year
    this.month = month
    this.day = day
    this.hour = hour
    this.minute = minute
    this.second = second
    this.nanosecond = nanosecond

    if (timeZoneOffsetSeconds !== undefined) {
      this.timeZoneOffsetSeconds = timeZoneOffsetSeconds
    }

    if (timeZoneId !== undefined) {
      this.timeZoneId = timeZoneId
    }

    Object.freeze(this)
  }

  toString(): string {
    const date = new Date(this.year, this.month, this.day)
    const hour = String(this.hour).padStart(2, '0')
    const minute = String(this.minute).padStart(2, '0')
    const second = String(this.second).padStart(2, '0')

    let timeStr: string
    if (this.nanosecond !== 0) {
      timeStr = `${hour}:${minute}:${second}.${String(this.nanosecond).padStart(9, '0')}`
    } else {
      timeStr = `${hour}:${minute}:${second}`
    }

    const dateTimeStr = `${date.toString()}T${timeStr}`

    // If we have a timeZoneId, include the offset and zone
    if (this.timeZoneId) {
      if (this.timeZoneOffsetSeconds !== undefined) {
        const offsetStr = this.formatOffset(this.timeZoneOffsetSeconds)
        return `${dateTimeStr}${offsetStr}[${this.timeZoneId}]`
      }
      return `${dateTimeStr}[${this.timeZoneId}]`
    }

    // If we have just an offset
    if (this.timeZoneOffsetSeconds !== undefined) {
      return `${dateTimeStr}${this.formatOffset(this.timeZoneOffsetSeconds)}`
    }

    return dateTimeStr
  }

  private formatOffset(offsetSeconds: number): string {
    if (offsetSeconds === 0) {
      return 'Z'
    }

    const sign = offsetSeconds < 0 ? '-' : '+'
    const absOffset = Math.abs(offsetSeconds)
    const hours = Math.floor(absOffset / SECONDS_PER_HOUR)
    const minutes = Math.floor((absOffset % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)

    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  static fromStandardDate(standardDate: globalThis.Date, nanosecond?: number): DateTime {
    const ns = nanosecond !== undefined ? nanosecond : standardDate.getMilliseconds() * 1_000_000
    return new DateTime(
      standardDate.getFullYear(),
      standardDate.getMonth() + 1,
      standardDate.getDate(),
      standardDate.getHours(),
      standardDate.getMinutes(),
      standardDate.getSeconds(),
      ns,
      -standardDate.getTimezoneOffset() * SECONDS_PER_MINUTE
    )
  }

  toStandardDate(): globalThis.Date {
    // If we have a timezone offset, we need to create a UTC date
    // The stored time is the "wall clock" time in the given timezone
    // So we need to convert to UTC by subtracting the offset
    if (this.timeZoneOffsetSeconds !== undefined) {
      const utcMs = globalThis.Date.UTC(
        this.year,
        this.month - 1,
        this.day,
        this.hour,
        this.minute,
        this.second,
        Math.floor(this.nanosecond / 1_000_000)
      )
      // Subtract the offset to get UTC time
      // (e.g., if offset is +3600 (UTC+1), we subtract 3600000ms to get UTC)
      return new globalThis.Date(utcMs - this.timeZoneOffsetSeconds * 1000)
    }

    // Without offset, treat as local time
    return new globalThis.Date(
      this.year,
      this.month - 1,
      this.day,
      this.hour,
      this.minute,
      this.second,
      Math.floor(this.nanosecond / 1_000_000)
    )
  }
}

/**
 * Represents a duration: a period of time with months, days, seconds, and nanoseconds.
 */
export class Duration {
  readonly months: number
  readonly days: number
  readonly seconds: number
  readonly nanoseconds: number

  constructor(months: number, days: number, seconds: number, nanoseconds: number) {
    this.months = months
    this.days = days
    this.seconds = seconds
    this.nanoseconds = nanoseconds
    Object.freeze(this)
  }

  toString(): string {
    // Neo4j uses the format P<months>M<days>DT<seconds>S
    // It does NOT break down into years, hours, minutes
    if (this.nanoseconds !== 0) {
      return `P${this.months}M${this.days}DT${this.seconds}.${String(Math.abs(this.nanoseconds)).padStart(9, '0')}S`
    }
    return `P${this.months}M${this.days}DT${this.seconds}S`
  }
}

// Type guards

/**
 * Check if a value is a Duration
 */
export function isDuration(value: unknown): value is Duration {
  return value instanceof Duration
}

/**
 * Check if a value is a LocalTime
 */
export function isLocalTime(value: unknown): value is LocalTime {
  return value instanceof LocalTime
}

/**
 * Check if a value is a Time
 */
export function isTime(value: unknown): value is Time {
  return value instanceof Time
}

/**
 * Check if a value is a Date
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date
}

/**
 * Check if a value is a LocalDateTime
 */
export function isLocalDateTime(value: unknown): value is LocalDateTime {
  return value instanceof LocalDateTime
}

/**
 * Check if a value is a DateTime
 */
export function isDateTime(value: unknown): value is DateTime {
  return value instanceof DateTime
}

/**
 * Temporal namespace for type checks
 */
export const temporal = {
  isDuration,
  isLocalTime,
  isTime,
  isDate,
  isLocalDateTime,
  isDateTime
}
