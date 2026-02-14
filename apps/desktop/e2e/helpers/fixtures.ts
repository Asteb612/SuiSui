import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures/workspaces')

/**
 * Copy a fixture workspace to a temp directory.
 * Returns the temp directory path.
 */
export async function copyFixture(name: string): Promise<string> {
  const src = path.join(FIXTURES_DIR, name)
  if (!fs.existsSync(src)) {
    throw new Error(`Fixture "${name}" not found at ${src}`)
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `suisui-e2e-${name}-`))
  copyDirSync(src, tmpDir)
  return tmpDir
}

/**
 * Remove a temp fixture directory.
 */
export async function cleanupFixture(dirPath: string): Promise<void> {
  if (!dirPath.includes('suisui-e2e-')) {
    throw new Error(`Refusing to delete path that doesn't look like a fixture temp dir: ${dirPath}`)
  }
  fs.rmSync(dirPath, { recursive: true, force: true })
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
