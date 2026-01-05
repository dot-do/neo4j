import { describe, it, expect } from 'vitest'
import { Point, isPoint, spatial, SRID } from '../point'
import { int } from '../integer'

describe('Point', () => {
  describe('Constructor', () => {
    it('creates a 2D point with number SRID', () => {
      const point = new Point(7203, 1.5, 2.5)
      expect(point.sridNumber).toBe(7203)
      expect(point.x).toBe(1.5)
      expect(point.y).toBe(2.5)
      expect(point.z).toBeUndefined()
    })

    it('creates a 3D point with z coordinate', () => {
      const point = new Point(9157, 1, 2, 3)
      expect(point.sridNumber).toBe(9157)
      expect(point.x).toBe(1)
      expect(point.y).toBe(2)
      expect(point.z).toBe(3)
    })

    it('creates a point with Integer SRID', () => {
      const point = new Point(int(4326), 12.5, 55.7)
      expect(point.sridNumber).toBe(4326)
      expect(point.x).toBe(12.5)
      expect(point.y).toBe(55.7)
    })

    it('creates a point with BigInt SRID', () => {
      const point = new Point(BigInt(4979), 12.5, 55.7, 100)
      expect(point.sridNumber).toBe(4979)
      expect(point.x).toBe(12.5)
      expect(point.y).toBe(55.7)
      expect(point.z).toBe(100)
    })
  })

  describe('SRID Constants', () => {
    it('has correct WGS-84 2D SRID', () => {
      expect(SRID.WGS_84_2D).toBe(4326)
    })

    it('has correct WGS-84 3D SRID', () => {
      expect(SRID.WGS_84_3D).toBe(4979)
    })

    it('has correct Cartesian 2D SRID', () => {
      expect(SRID.CARTESIAN_2D).toBe(7203)
    })

    it('has correct Cartesian 3D SRID', () => {
      expect(SRID.CARTESIAN_3D).toBe(9157)
    })
  })

  describe('Type detection', () => {
    it('is3D returns true for 3D points', () => {
      const point3D = new Point(9157, 1, 2, 3)
      expect(point3D.is3D).toBe(true)
    })

    it('is3D returns false for 2D points', () => {
      const point2D = new Point(7203, 1, 2)
      expect(point2D.is3D).toBe(false)
    })

    it('isGeographic returns true for WGS-84 2D', () => {
      const point = new Point(SRID.WGS_84_2D, -122.4, 37.8)
      expect(point.isGeographic).toBe(true)
    })

    it('isGeographic returns true for WGS-84 3D', () => {
      const point = new Point(SRID.WGS_84_3D, -122.4, 37.8, 100)
      expect(point.isGeographic).toBe(true)
    })

    it('isGeographic returns false for Cartesian', () => {
      const point = new Point(SRID.CARTESIAN_2D, 1, 2)
      expect(point.isGeographic).toBe(false)
    })

    it('isCartesian returns true for Cartesian 2D', () => {
      const point = new Point(SRID.CARTESIAN_2D, 1, 2)
      expect(point.isCartesian).toBe(true)
    })

    it('isCartesian returns true for Cartesian 3D', () => {
      const point = new Point(SRID.CARTESIAN_3D, 1, 2, 3)
      expect(point.isCartesian).toBe(true)
    })

    it('isCartesian returns false for WGS-84', () => {
      const point = new Point(SRID.WGS_84_2D, -122.4, 37.8)
      expect(point.isCartesian).toBe(false)
    })
  })

  describe('Geographic aliases', () => {
    it('returns longitude for geographic points', () => {
      const point = new Point(SRID.WGS_84_2D, -122.4, 37.8)
      expect(point.longitude).toBe(-122.4)
    })

    it('returns latitude for geographic points', () => {
      const point = new Point(SRID.WGS_84_2D, -122.4, 37.8)
      expect(point.latitude).toBe(37.8)
    })

    it('returns height for geographic 3D points', () => {
      const point = new Point(SRID.WGS_84_3D, -122.4, 37.8, 100)
      expect(point.height).toBe(100)
    })

    it('returns undefined for longitude on Cartesian points', () => {
      const point = new Point(SRID.CARTESIAN_2D, 1, 2)
      expect(point.longitude).toBeUndefined()
    })

    it('returns undefined for latitude on Cartesian points', () => {
      const point = new Point(SRID.CARTESIAN_2D, 1, 2)
      expect(point.latitude).toBeUndefined()
    })

    it('returns undefined for height on Cartesian 3D points', () => {
      const point = new Point(SRID.CARTESIAN_3D, 1, 2, 3)
      expect(point.height).toBeUndefined()
    })
  })

  describe('toString()', () => {
    it('returns Cypher format for 2D point', () => {
      const point = new Point(7203, 1.5, 2.5)
      expect(point.toString()).toBe('point({srid:7203, x:1.5, y:2.5})')
    })

    it('returns Cypher format for 3D point', () => {
      const point = new Point(9157, 1, 2, 3)
      expect(point.toString()).toBe('point({srid:9157, x:1, y:2, z:3})')
    })
  })

  describe('toWKT()', () => {
    it('returns WKT format for 2D point', () => {
      const point = new Point(7203, 1.5, 2.5)
      expect(point.toWKT()).toBe('POINT (1.5 2.5)')
    })

    it('returns WKT format for 3D point', () => {
      const point = new Point(9157, 1, 2, 3)
      expect(point.toWKT()).toBe('POINT Z (1 2 3)')
    })
  })

  describe('toGeoJSON()', () => {
    it('returns GeoJSON for 2D geographic point', () => {
      const point = new Point(SRID.WGS_84_2D, -122.4, 37.8)
      const geoJson = point.toGeoJSON()
      expect(geoJson).toEqual({
        type: 'Point',
        coordinates: [-122.4, 37.8]
      })
    })

    it('returns GeoJSON for 3D geographic point', () => {
      const point = new Point(SRID.WGS_84_3D, -122.4, 37.8, 100)
      const geoJson = point.toGeoJSON()
      expect(geoJson).toEqual({
        type: 'Point',
        coordinates: [-122.4, 37.8, 100]
      })
    })

    it('returns null for Cartesian points', () => {
      const point = new Point(SRID.CARTESIAN_2D, 1, 2)
      expect(point.toGeoJSON()).toBeNull()
    })
  })

  describe('distanceTo() - Euclidean distance', () => {
    it('calculates 2D Euclidean distance', () => {
      const p1 = new Point(SRID.CARTESIAN_2D, 0, 0)
      const p2 = new Point(SRID.CARTESIAN_2D, 3, 4)
      expect(p1.distanceTo(p2)).toBe(5)
    })

    it('calculates 3D Euclidean distance', () => {
      const p1 = new Point(SRID.CARTESIAN_3D, 0, 0, 0)
      const p2 = new Point(SRID.CARTESIAN_3D, 1, 2, 2)
      expect(p1.distanceTo(p2)).toBe(3)
    })

    it('handles same point (zero distance)', () => {
      const p1 = new Point(SRID.CARTESIAN_2D, 5, 5)
      const p2 = new Point(SRID.CARTESIAN_2D, 5, 5)
      expect(p1.distanceTo(p2)).toBe(0)
    })

    it('handles negative coordinates', () => {
      const p1 = new Point(SRID.CARTESIAN_2D, -3, -4)
      const p2 = new Point(SRID.CARTESIAN_2D, 0, 0)
      expect(p1.distanceTo(p2)).toBe(5)
    })

    it('calculates 2D distance when only one point has z', () => {
      const p1 = new Point(SRID.CARTESIAN_2D, 0, 0)
      const p2 = new Point(SRID.CARTESIAN_3D, 3, 4, 5)
      expect(p1.distanceTo(p2)).toBe(5) // Ignores z
    })
  })

  describe('haversineDistanceTo() - Geographic distance', () => {
    it('calculates distance between two geographic points', () => {
      // New York to London (approximate)
      const nyc = new Point(SRID.WGS_84_2D, -74.006, 40.7128)
      const london = new Point(SRID.WGS_84_2D, -0.1276, 51.5074)
      const distance = nyc.haversineDistanceTo(london)

      // Distance should be approximately 5,570 km
      expect(distance).toBeGreaterThan(5500000)
      expect(distance).toBeLessThan(5600000)
    })

    it('returns null for non-geographic points', () => {
      const p1 = new Point(SRID.CARTESIAN_2D, 0, 0)
      const p2 = new Point(SRID.CARTESIAN_2D, 1, 1)
      expect(p1.haversineDistanceTo(p2)).toBeNull()
    })

    it('returns null when only one point is geographic', () => {
      const p1 = new Point(SRID.WGS_84_2D, -74.006, 40.7128)
      const p2 = new Point(SRID.CARTESIAN_2D, 1, 1)
      expect(p1.haversineDistanceTo(p2)).toBeNull()
    })

    it('returns 0 for same location', () => {
      const p1 = new Point(SRID.WGS_84_2D, -74.006, 40.7128)
      const p2 = new Point(SRID.WGS_84_2D, -74.006, 40.7128)
      expect(p1.haversineDistanceTo(p2)).toBe(0)
    })
  })

  describe('distance() - Smart distance calculation', () => {
    it('uses Euclidean for Cartesian points', () => {
      const p1 = new Point(SRID.CARTESIAN_2D, 0, 0)
      const p2 = new Point(SRID.CARTESIAN_2D, 3, 4)
      expect(p1.distance(p2)).toBe(5)
    })

    it('uses Haversine for Geographic points', () => {
      const nyc = new Point(SRID.WGS_84_2D, -74.006, 40.7128)
      const london = new Point(SRID.WGS_84_2D, -0.1276, 51.5074)
      const distance = nyc.distance(london)

      expect(distance).toBeGreaterThan(5500000)
      expect(distance).toBeLessThan(5600000)
    })

    it('returns Euclidean when mixing geographic and cartesian', () => {
      const p1 = new Point(SRID.WGS_84_2D, 0, 0)
      const p2 = new Point(SRID.CARTESIAN_2D, 3, 4)
      // Falls back to Euclidean since they're not both geographic
      expect(p1.distance(p2)).toBe(5)
    })
  })

  describe('equals()', () => {
    it('returns true for identical 2D points', () => {
      const p1 = new Point(7203, 1.5, 2.5)
      const p2 = new Point(7203, 1.5, 2.5)
      expect(p1.equals(p2)).toBe(true)
    })

    it('returns true for identical 3D points', () => {
      const p1 = new Point(9157, 1, 2, 3)
      const p2 = new Point(9157, 1, 2, 3)
      expect(p1.equals(p2)).toBe(true)
    })

    it('returns false for different SRID', () => {
      const p1 = new Point(7203, 1, 2)
      const p2 = new Point(4326, 1, 2)
      expect(p1.equals(p2)).toBe(false)
    })

    it('returns false for different x', () => {
      const p1 = new Point(7203, 1, 2)
      const p2 = new Point(7203, 2, 2)
      expect(p1.equals(p2)).toBe(false)
    })

    it('returns false for different y', () => {
      const p1 = new Point(7203, 1, 2)
      const p2 = new Point(7203, 1, 3)
      expect(p1.equals(p2)).toBe(false)
    })

    it('returns false for different z', () => {
      const p1 = new Point(9157, 1, 2, 3)
      const p2 = new Point(9157, 1, 2, 4)
      expect(p1.equals(p2)).toBe(false)
    })

    it('returns false when one has z and other does not', () => {
      const p1 = new Point(7203, 1, 2)
      const p2 = new Point(9157, 1, 2, 3)
      expect(p1.equals(p2)).toBe(false)
    })

    it('compares using Integer and number SRID correctly', () => {
      const p1 = new Point(int(7203), 1, 2)
      const p2 = new Point(7203, 1, 2)
      expect(p1.equals(p2)).toBe(true)
    })
  })

  describe('Static factory methods', () => {
    describe('fromWGS84()', () => {
      it('creates WGS-84 2D point', () => {
        const point = Point.fromWGS84(-122.4, 37.8)
        expect(point.sridNumber).toBe(SRID.WGS_84_2D)
        expect(point.x).toBe(-122.4)
        expect(point.y).toBe(37.8)
        expect(point.z).toBeUndefined()
      })
    })

    describe('fromWGS84_3D()', () => {
      it('creates WGS-84 3D point', () => {
        const point = Point.fromWGS84_3D(-122.4, 37.8, 100)
        expect(point.sridNumber).toBe(SRID.WGS_84_3D)
        expect(point.x).toBe(-122.4)
        expect(point.y).toBe(37.8)
        expect(point.z).toBe(100)
      })
    })

    describe('fromCartesian2D()', () => {
      it('creates Cartesian 2D point', () => {
        const point = Point.fromCartesian2D(10, 20)
        expect(point.sridNumber).toBe(SRID.CARTESIAN_2D)
        expect(point.x).toBe(10)
        expect(point.y).toBe(20)
        expect(point.z).toBeUndefined()
      })
    })

    describe('fromCartesian3D()', () => {
      it('creates Cartesian 3D point', () => {
        const point = Point.fromCartesian3D(10, 20, 30)
        expect(point.sridNumber).toBe(SRID.CARTESIAN_3D)
        expect(point.x).toBe(10)
        expect(point.y).toBe(20)
        expect(point.z).toBe(30)
      })
    })

    describe('fromGeoJSON()', () => {
      it('creates 2D point from GeoJSON', () => {
        const point = Point.fromGeoJSON({
          type: 'Point',
          coordinates: [-122.4, 37.8]
        })
        expect(point.sridNumber).toBe(SRID.WGS_84_2D)
        expect(point.x).toBe(-122.4)
        expect(point.y).toBe(37.8)
      })

      it('creates 3D point from GeoJSON', () => {
        const point = Point.fromGeoJSON({
          type: 'Point',
          coordinates: [-122.4, 37.8, 100]
        })
        expect(point.sridNumber).toBe(SRID.WGS_84_3D)
        expect(point.x).toBe(-122.4)
        expect(point.y).toBe(37.8)
        expect(point.z).toBe(100)
      })

      it('throws for invalid GeoJSON coordinates', () => {
        expect(() => {
          Point.fromGeoJSON({
            type: 'Point',
            coordinates: [-122.4]
          })
        }).toThrow('Invalid GeoJSON Point coordinates')
      })
    })
  })

  describe('Immutability', () => {
    it('point is frozen (immutable)', () => {
      const point = new Point(7203, 1, 2)
      expect(Object.isFrozen(point)).toBe(true)
    })

    it('cannot modify x property', () => {
      const point = new Point(7203, 1, 2)
      expect(() => {
        // @ts-expect-error - testing runtime immutability
        point.x = 5
      }).toThrow()
    })

    it('cannot modify y property', () => {
      const point = new Point(7203, 1, 2)
      expect(() => {
        // @ts-expect-error - testing runtime immutability
        point.y = 5
      }).toThrow()
    })

    it('cannot add new properties', () => {
      const point = new Point(7203, 1, 2)
      expect(() => {
        // @ts-expect-error - testing runtime immutability
        point.newProp = 'test'
      }).toThrow()
    })
  })

  describe('Type guards', () => {
    describe('isPoint()', () => {
      it('returns true for Point instance', () => {
        const point = new Point(7203, 1, 2)
        expect(isPoint(point)).toBe(true)
      })

      it('returns false for plain object', () => {
        const obj = { srid: 7203, x: 1, y: 2 }
        expect(isPoint(obj)).toBe(false)
      })

      it('returns false for null', () => {
        expect(isPoint(null)).toBe(false)
      })

      it('returns false for undefined', () => {
        expect(isPoint(undefined)).toBe(false)
      })

      it('returns false for number', () => {
        expect(isPoint(42)).toBe(false)
      })

      it('returns false for string', () => {
        expect(isPoint('point')).toBe(false)
      })
    })
  })

  describe('spatial namespace', () => {
    it('contains isPoint function', () => {
      expect(spatial.isPoint).toBe(isPoint)
    })

    it('contains SRID constants', () => {
      expect(spatial.SRID).toBe(SRID)
    })
  })

  describe('Edge cases', () => {
    it('handles zero coordinates', () => {
      const point = new Point(7203, 0, 0)
      expect(point.x).toBe(0)
      expect(point.y).toBe(0)
      expect(point.toString()).toBe('point({srid:7203, x:0, y:0})')
    })

    it('handles negative coordinates', () => {
      const point = new Point(7203, -10.5, -20.5)
      expect(point.x).toBe(-10.5)
      expect(point.y).toBe(-20.5)
    })

    it('handles very large coordinates', () => {
      const point = new Point(7203, 1e10, 1e10)
      expect(point.x).toBe(1e10)
      expect(point.y).toBe(1e10)
    })

    it('handles very small coordinates', () => {
      const point = new Point(7203, 1e-10, 1e-10)
      expect(point.x).toBe(1e-10)
      expect(point.y).toBe(1e-10)
    })

    it('handles Infinity coordinates', () => {
      const point = new Point(7203, Infinity, -Infinity)
      expect(point.x).toBe(Infinity)
      expect(point.y).toBe(-Infinity)
    })

    it('handles NaN coordinates', () => {
      const point = new Point(7203, NaN, NaN)
      expect(Number.isNaN(point.x)).toBe(true)
      expect(Number.isNaN(point.y)).toBe(true)
    })

    it('z being undefined vs z being 0 are different', () => {
      const p1 = new Point(7203, 1, 2)
      const p2 = new Point(9157, 1, 2, 0)
      expect(p1.z).toBeUndefined()
      expect(p2.z).toBe(0)
      expect(p1.is3D).toBe(false)
      expect(p2.is3D).toBe(true)
    })
  })
})
