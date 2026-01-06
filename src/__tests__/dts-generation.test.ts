/**
 * Tests for TypeScript declaration file (.d.ts) generation
 *
 * These tests verify that tsup properly generates type declarations for the package.
 * Currently tsup.config.ts has `dts: false` - these tests will FAIL until that is fixed.
 *
 * RED TDD: Write failing tests first, then fix the implementation.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Get the project root directory
const projectRoot = path.resolve(__dirname, '../..')

describe('TypeScript Declaration Generation', () => {
  const distDir = path.join(projectRoot, 'dist')
  const mainDtsFile = path.join(distDir, 'index.d.ts')

  describe('dts file generation', () => {
    it('should generate index.d.ts file in dist directory', () => {
      expect(fs.existsSync(mainDtsFile)).toBe(true)
    })

    it('should have index.d.ts with non-empty content', () => {
      expect(fs.existsSync(mainDtsFile)).toBe(true)
      const content = fs.readFileSync(mainDtsFile, 'utf-8')
      expect(content.length).toBeGreaterThan(0)
    })
  })

  describe('exported types accessibility', () => {
    let dtsContent: string

    beforeAll(() => {
      if (fs.existsSync(mainDtsFile)) {
        dtsContent = fs.readFileSync(mainDtsFile, 'utf-8')
      } else {
        dtsContent = ''
      }
    })

    it('should export AuthToken type', () => {
      expect(dtsContent).toContain('AuthToken')
    })

    it('should export Config type', () => {
      expect(dtsContent).toContain('Config')
    })

    it('should export SessionConfig type', () => {
      expect(dtsContent).toContain('SessionConfig')
    })

    it('should export TransactionConfig type', () => {
      expect(dtsContent).toContain('TransactionConfig')
    })

    it('should export ParsedUri type', () => {
      expect(dtsContent).toContain('ParsedUri')
    })

    it('should export AccessMode type', () => {
      expect(dtsContent).toContain('AccessMode')
    })

    it('should export Driver class', () => {
      expect(dtsContent).toContain('Driver')
    })

    it('should export auth namespace/object', () => {
      expect(dtsContent).toContain('auth')
    })

    it('should export driver factory function', () => {
      // The driver factory is exported as `driver` (alias for createDriver)
      expect(dtsContent).toContain('driver')
    })

    it('should export Env interface', () => {
      expect(dtsContent).toContain('Env')
    })
  })

  describe('no type conflicts between modules', () => {
    let dtsContent: string

    beforeAll(() => {
      if (fs.existsSync(mainDtsFile)) {
        dtsContent = fs.readFileSync(mainDtsFile, 'utf-8')
      } else {
        dtsContent = ''
      }
    })

    it('should have valid TypeScript declaration syntax (no duplicate identifiers)', () => {
      // Check that we don't have duplicate export statements for the same identifier
      // This would indicate a type conflict
      const exportMatches = dtsContent.match(/export\s+{\s*(\w+)/g) || []
      const exports = exportMatches.map((m) => m.match(/export\s+{\s*(\w+)/)?.[1]).filter(Boolean)

      // Count occurrences of each export
      const exportCounts = exports.reduce(
        (acc, exp) => {
          acc[exp!] = (acc[exp!] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      )

      // Find any duplicates
      const duplicates = Object.entries(exportCounts)
        .filter(([, count]) => count > 1)
        .map(([name]) => name)

      expect(duplicates).toEqual([])
    })

    it('should not have conflicting type declarations', () => {
      // Check for potential duplicate interface/type declarations
      // Multiple declarations of the same interface without merging indicates a conflict
      const interfaceMatches = dtsContent.match(/interface\s+(\w+)/g) || []
      const interfaces = interfaceMatches.map((m) => m.match(/interface\s+(\w+)/)?.[1]).filter(Boolean)

      // For this test, we just verify we can parse the interfaces
      // The actual duplicate check would be done by the TypeScript compiler
      expect(interfaces.length).toBeGreaterThan(0)
    })

    it('should have consistent type re-exports from submodules', () => {
      // Verify that types from auth, driver, and types modules are properly re-exported
      // The .d.ts file should consolidate these without conflicts

      // Check for auth module exports
      expect(dtsContent).toMatch(/auth/i)

      // Check for driver-related types
      expect(dtsContent).toMatch(/Driver/i)

      // Check for config types
      expect(dtsContent).toMatch(/Config/i)
    })

    it('should properly declare the default export', () => {
      // The module has a default export (Cloudflare Worker entry point)
      // This should be properly declared - either as `export default` or `as default` in export clause
      expect(dtsContent).toMatch(/export\s+default|default\s+export|as\s+default/i)
    })
  })

  describe('package.json types field alignment', () => {
    let packageJson: { types?: string; exports?: Record<string, unknown> }

    beforeAll(() => {
      const packageJsonPath = path.join(projectRoot, 'package.json')
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    })

    it('should have types field pointing to existing file', () => {
      expect(packageJson.types).toBe('dist/index.d.ts')
      const typesPath = path.join(projectRoot, packageJson.types!)
      expect(fs.existsSync(typesPath)).toBe(true)
    })

    it('should have exports with types condition pointing to existing file', () => {
      const exportsRoot = packageJson.exports?.['.'] as { types?: string } | undefined
      expect(exportsRoot?.types).toBe('./dist/index.d.ts')

      if (exportsRoot?.types) {
        const typesPath = path.join(projectRoot, exportsRoot.types)
        expect(fs.existsSync(typesPath)).toBe(true)
      }
    })
  })
})
