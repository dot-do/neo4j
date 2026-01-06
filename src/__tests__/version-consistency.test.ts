import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('version consistency', () => {
  it('version in index.ts matches package.json', () => {
    // Read version from package.json
    const packageJsonPath = join(__dirname, '../../package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    const packageVersion = packageJson.version

    // Read version from index.ts source
    const indexPath = join(__dirname, '../index.ts')
    const indexSource = readFileSync(indexPath, 'utf-8')

    // Extract hardcoded version from index.ts
    // Looking for: version: '0.1.0' or version: "0.1.0"
    const versionMatch = indexSource.match(/version:\s*['"]([^'"]+)['"]/)

    expect(versionMatch).not.toBeNull()
    const indexVersion = versionMatch![1]

    expect(indexVersion).toBe(packageVersion)
  })
})
