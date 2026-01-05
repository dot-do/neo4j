/**
 * Point Type - Neo4j spatial point implementation
 *
 * Compatible with neo4j-driver's Point type.
 * @see https://neo4j.com/docs/javascript-manual/current/data-types/#spatial-types
 */

import { Integer, int, isInt } from './integer'

// Helper to normalize Integer or number to number
function normalizeNumber(value: Integer | number | bigint): number {
  if (isInt(value)) {
    return value.toNumber()
  }
  if (typeof value === 'bigint') {
    return Number(value)
  }
  return value
}

// Helper to convert to Integer
function toInteger(value: Integer | number | bigint): Integer {
  if (isInt(value)) return value
  return int(value)
}

/**
 * SRID constants for common coordinate systems
 */
export const SRID = {
  /** WGS-84 2D - Geographic coordinates (longitude, latitude) */
  WGS_84_2D: 4326,
  /** WGS-84 3D - Geographic coordinates with height (longitude, latitude, height) */
  WGS_84_3D: 4979,
  /** Cartesian 2D - Flat coordinate system (x, y) */
  CARTESIAN_2D: 7203,
  /** Cartesian 3D - Flat coordinate system (x, y, z) */
  CARTESIAN_3D: 9157
} as const

/**
 * Represents a point in space.
 *
 * A Point can be either:
 * - 2D with (x, y) coordinates
 * - 3D with (x, y, z) coordinates
 * - Geographic 2D with (longitude, latitude) in WGS-84
 * - Geographic 3D with (longitude, latitude, height) in WGS-84
 */
export class Point {
  readonly srid: Integer
  readonly x: number
  readonly y: number
  readonly z?: number

  /**
   * Create a new Point
   *
   * @param srid - Spatial Reference Identifier (4326 for WGS-84, 7203 for Cartesian 2D, etc.)
   * @param x - X coordinate (or longitude for geographic)
   * @param y - Y coordinate (or latitude for geographic)
   * @param z - Optional Z coordinate (or height for geographic 3D)
   */
  constructor(
    srid: Integer | number | bigint,
    x: number,
    y: number,
    z?: number
  ) {
    this.srid = toInteger(srid)
    this.x = x
    this.y = y
    if (z !== undefined) {
      this.z = z
    }
    // Make the point immutable
    Object.freeze(this)
  }

  /**
   * Get the SRID as a number
   */
  get sridNumber(): number {
    return normalizeNumber(this.srid)
  }

  /**
   * Check if this is a 3D point
   */
  get is3D(): boolean {
    return this.z !== undefined
  }

  /**
   * Check if this is a geographic (WGS-84) point
   */
  get isGeographic(): boolean {
    const srid = this.sridNumber
    return srid === SRID.WGS_84_2D || srid === SRID.WGS_84_3D
  }

  /**
   * Check if this is a Cartesian point
   */
  get isCartesian(): boolean {
    const srid = this.sridNumber
    return srid === SRID.CARTESIAN_2D || srid === SRID.CARTESIAN_3D
  }

  /**
   * Get longitude (alias for x on geographic points)
   */
  get longitude(): number | undefined {
    return this.isGeographic ? this.x : undefined
  }

  /**
   * Get latitude (alias for y on geographic points)
   */
  get latitude(): number | undefined {
    return this.isGeographic ? this.y : undefined
  }

  /**
   * Get height (alias for z on geographic 3D points)
   */
  get height(): number | undefined {
    return this.isGeographic ? this.z : undefined
  }

  /**
   * Convert to string representation (Neo4j Cypher format)
   */
  toString(): string {
    const srid = this.sridNumber
    if (this.z !== undefined) {
      return `point({srid:${srid}, x:${this.x}, y:${this.y}, z:${this.z}})`
    }
    return `point({srid:${srid}, x:${this.x}, y:${this.y}})`
  }

  /**
   * Convert to WKT (Well-Known Text) format
   */
  toWKT(): string {
    if (this.z !== undefined) {
      return `POINT Z (${this.x} ${this.y} ${this.z})`
    }
    return `POINT (${this.x} ${this.y})`
  }

  /**
   * Convert to GeoJSON format (for geographic points)
   */
  toGeoJSON(): { type: 'Point'; coordinates: number[] } | null {
    if (!this.isGeographic) {
      return null
    }
    
    const coordinates = this.z !== undefined
      ? [this.x, this.y, this.z]
      : [this.x, this.y]
    
    return {
      type: 'Point',
      coordinates
    }
  }

  /**
   * Calculate Euclidean distance to another point
   * Note: Only works for Cartesian points. For geographic distance, use haversine.
   */
  distanceTo(other: Point): number {
    const dx = this.x - other.x
    const dy = this.y - other.y

    if (this.z !== undefined && other.z !== undefined) {
      const dz = this.z - other.z
      return Math.sqrt(dx * dx + dy * dy + dz * dz)
    }

    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * Calculate distance to another point.
   * For Cartesian points: returns Euclidean distance
   * For Geographic points: returns great-circle distance in meters (Haversine)
   */
  distance(other: Point): number {
    if (this.isGeographic && other.isGeographic) {
      return this.haversineDistanceTo(other) ?? 0
    }
    return this.distanceTo(other)
  }

  /**
   * Calculate great-circle distance to another point using the Haversine formula
   * Only valid for WGS-84 geographic points.
   * @returns Distance in meters
   */
  haversineDistanceTo(other: Point): number | null {
    if (!this.isGeographic || !other.isGeographic) {
      return null
    }

    const R = 6371000 // Earth's radius in meters
    const lat1 = this.y * Math.PI / 180
    const lat2 = other.y * Math.PI / 180
    const dLat = (other.y - this.y) * Math.PI / 180
    const dLon = (other.x - this.x) * Math.PI / 180

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c
  }

  /**
   * Check equality with another point
   */
  equals(other: Point): boolean {
    return normalizeNumber(this.srid) === normalizeNumber(other.srid) &&
           this.x === other.x &&
           this.y === other.y &&
           this.z === other.z
  }

  /**
   * Create a WGS-84 2D point from longitude/latitude
   */
  static fromWGS84(longitude: number, latitude: number): Point {
    return new Point(SRID.WGS_84_2D, longitude, latitude)
  }

  /**
   * Create a WGS-84 3D point from longitude/latitude/height
   */
  static fromWGS84_3D(longitude: number, latitude: number, height: number): Point {
    return new Point(SRID.WGS_84_3D, longitude, latitude, height)
  }

  /**
   * Create a Cartesian 2D point
   */
  static fromCartesian2D(x: number, y: number): Point {
    return new Point(SRID.CARTESIAN_2D, x, y)
  }

  /**
   * Create a Cartesian 3D point
   */
  static fromCartesian3D(x: number, y: number, z: number): Point {
    return new Point(SRID.CARTESIAN_3D, x, y, z)
  }

  /**
   * Create a Point from GeoJSON
   */
  static fromGeoJSON(geoJson: { type: 'Point'; coordinates: number[] }): Point {
    const { coordinates } = geoJson
    if (coordinates.length === 2) {
      return new Point(SRID.WGS_84_2D, coordinates[0], coordinates[1])
    }
    if (coordinates.length === 3) {
      return new Point(SRID.WGS_84_3D, coordinates[0], coordinates[1], coordinates[2])
    }
    throw new Error('Invalid GeoJSON Point coordinates')
  }
}

/**
 * Type guard to check if a value is a Point
 */
export function isPoint(value: unknown): value is Point {
  return value instanceof Point
}

/**
 * Spatial namespace for type checks and utilities
 */
export const spatial = {
  isPoint,
  SRID
}
