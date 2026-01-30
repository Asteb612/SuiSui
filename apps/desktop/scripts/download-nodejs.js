#!/usr/bin/env node

/**
 * Downloads and extracts Node.js v22 LTS binaries for embedding in the packaged app.
 *
 * Usage:
 *   node scripts/download-nodejs.js              # Download all platforms (CI/release)
 *   node scripts/download-nodejs.js --current-only  # Download current platform only (dev)
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const { execSync, spawn } = require('child_process')

/**
 * Recursively copy a directory (works better than rename on Windows)
 */
function copyDirSync(src, dest) {
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

/**
 * Move a file or directory with fallback to copy+delete on Windows
 */
function moveSync(src, dest) {
  try {
    // First, remove destination if it exists
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true })
    }
    fs.renameSync(src, dest)
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EXDEV') {
      // Fallback: copy then delete (handles cross-device moves and Windows locks)
      const stat = fs.statSync(src)
      if (stat.isDirectory()) {
        copyDirSync(src, dest)
      } else {
        fs.copyFileSync(src, dest)
      }
      // Try to remove source, but don't fail if we can't
      try {
        fs.rmSync(src, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    } else {
      throw err
    }
  }
}

const NODE_VERSION = '22.13.1'
const BASE_URL = `https://nodejs.org/dist/v${NODE_VERSION}`

const PLATFORMS = [
  { platform: 'linux', arch: 'x64', ext: 'tar.xz', folder: 'linux-x64' },
  { platform: 'darwin', arch: 'x64', ext: 'tar.gz', folder: 'darwin-x64' },
  { platform: 'darwin', arch: 'arm64', ext: 'tar.gz', folder: 'darwin-arm64' },
  // electron-builder uses 'win' not 'win32' for ${os} variable
  { platform: 'win32', arch: 'x64', ext: 'zip', folder: 'win-x64' },
]

const OUTPUT_DIR = path.join(__dirname, '..', 'nodejs-runtime')

function getFilename(platform, arch, ext) {
  const osName = platform === 'win32' ? 'win' : platform
  return `node-v${NODE_VERSION}-${osName}-${arch}.${ext}`
}

function getUrl(platform, arch, ext) {
  return `${BASE_URL}/${getFilename(platform, arch, ext)}`
}

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`)

    const file = fs.createWriteStream(destPath)
    let redirectCount = 0

    const download = (downloadUrl) => {
      https.get(downloadUrl, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          if (redirectCount++ > 5) {
            reject(new Error('Too many redirects'))
            return
          }
          download(response.headers.location)
          return
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`))
          return
        }

        const totalSize = parseInt(response.headers['content-length'], 10)
        let downloadedSize = 0
        let lastPercent = 0

        response.on('data', (chunk) => {
          downloadedSize += chunk.length
          const percent = Math.floor((downloadedSize / totalSize) * 100)
          if (percent >= lastPercent + 10) {
            process.stdout.write(`  ${percent}%...`)
            lastPercent = percent
          }
        })

        response.pipe(file)

        file.on('finish', () => {
          file.close()
          console.log(' done')
          resolve()
        })
      }).on('error', (err) => {
        fs.unlink(destPath, () => {})
        reject(err)
      })
    }

    download(url)
  })
}

async function extractTarGz(archivePath, destDir) {
  console.log(`Extracting ${path.basename(archivePath)}...`)

  // Use tar command which handles both .tar.gz and .tar.xz
  const isXz = archivePath.endsWith('.xz')
  const tarArgs = isXz
    ? ['-xJf', archivePath, '-C', destDir, '--strip-components=1']
    : ['-xzf', archivePath, '-C', destDir, '--strip-components=1']

  return new Promise((resolve, reject) => {
    const tar = spawn('tar', tarArgs, { stdio: 'inherit' })
    tar.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`tar exited with code ${code}`))
      }
    })
    tar.on('error', reject)
  })
}

async function extractZip(archivePath, destDir) {
  console.log(`Extracting ${path.basename(archivePath)}...`)

  // Try using unzip command first (cross-platform)
  return new Promise((resolve, reject) => {
    // First extract to a temp location
    const tempDir = path.join(path.dirname(destDir), '_temp_extract')
    fs.mkdirSync(tempDir, { recursive: true })

    const unzip = spawn('unzip', ['-q', '-o', archivePath, '-d', tempDir], {
      stdio: 'inherit',
    })

    unzip.on('close', (code) => {
      if (code !== 0) {
        // Try PowerShell on Windows
        if (process.platform === 'win32') {
          execSync(
            `powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${tempDir}' -Force"`,
            { stdio: 'inherit' }
          )
        } else {
          reject(new Error(`unzip exited with code ${code}`))
          return
        }
      }

      // Find the extracted folder (node-vX.X.X-win-x64)
      const entries = fs.readdirSync(tempDir)
      const nodeFolder = entries.find((e) => e.startsWith('node-'))
      if (!nodeFolder) {
        reject(new Error('Could not find extracted Node.js folder'))
        return
      }

      // Move contents to destination
      const srcDir = path.join(tempDir, nodeFolder)
      const files = fs.readdirSync(srcDir)
      for (const file of files) {
        moveSync(path.join(srcDir, file), path.join(destDir, file))
      }

      // Cleanup temp dir
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors on Windows
      }
      resolve()
    })

    unzip.on('error', (err) => {
      // If unzip not available, try PowerShell on Windows
      if (process.platform === 'win32') {
        try {
          execSync(
            `powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${tempDir}' -Force"`,
            { stdio: 'inherit' }
          )

          const entries = fs.readdirSync(tempDir)
          const nodeFolder = entries.find((e) => e.startsWith('node-'))
          if (nodeFolder) {
            const srcDir = path.join(tempDir, nodeFolder)
            const files = fs.readdirSync(srcDir)
            for (const file of files) {
              moveSync(path.join(srcDir, file), path.join(destDir, file))
            }
            try {
              fs.rmSync(tempDir, { recursive: true, force: true })
            } catch {
              // Ignore cleanup errors on Windows
            }
            resolve()
            return
          }
        } catch (psErr) {
          reject(psErr)
          return
        }
      }
      reject(err)
    })
  })
}

async function downloadAndExtract(platformInfo) {
  const { platform, arch, ext, folder } = platformInfo
  const filename = getFilename(platform, arch, ext)
  const url = getUrl(platform, arch, ext)
  const archivePath = path.join(OUTPUT_DIR, filename)
  const destDir = path.join(OUTPUT_DIR, folder)

  // Skip if already extracted
  const nodeExe = platform === 'win32' ? 'node.exe' : 'bin/node'
  if (fs.existsSync(path.join(destDir, nodeExe))) {
    console.log(`${folder} already extracted, skipping...`)
    return
  }

  // Create destination directory
  fs.mkdirSync(destDir, { recursive: true })

  // Download if not cached
  if (!fs.existsSync(archivePath)) {
    await downloadFile(url, archivePath)
  } else {
    console.log(`Using cached ${filename}`)
  }

  // Extract
  if (ext === 'zip') {
    await extractZip(archivePath, destDir)
  } else {
    await extractTarGz(archivePath, destDir)
  }

  // Remove archive to save space
  fs.unlinkSync(archivePath)

  console.log(`${folder} ready`)
}

async function main() {
  const args = process.argv.slice(2)
  const currentOnly = args.includes('--current-only')

  console.log(`Node.js v${NODE_VERSION} Download Script`)
  console.log('='.repeat(40))

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  let platforms = PLATFORMS

  if (currentOnly) {
    const currentPlatform = process.platform
    const currentArch = process.arch
    platforms = PLATFORMS.filter(
      (p) => p.platform === currentPlatform && p.arch === currentArch
    )

    if (platforms.length === 0) {
      console.error(
        `No matching platform found for ${currentPlatform}-${currentArch}`
      )
      console.log('Available platforms:', PLATFORMS.map((p) => p.folder).join(', '))
      process.exit(1)
    }

    console.log(`Downloading for current platform only: ${platforms[0].folder}`)
  } else {
    console.log('Downloading for all platforms...')
  }

  for (const platform of platforms) {
    try {
      await downloadAndExtract(platform)
    } catch (err) {
      console.error(`Failed to download ${platform.folder}:`, err.message)
      if (!currentOnly) {
        // Continue with other platforms in CI mode
        continue
      }
      process.exit(1)
    }
  }

  console.log('')
  console.log('Download complete!')
  console.log(`Output directory: ${OUTPUT_DIR}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
