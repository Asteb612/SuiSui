import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NodeService, resetNodeService } from '../services/NodeService'

// Mock electron app
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/mock/app/path',
  },
}))

// Mock fs
const mockExistsSync = vi.fn()
const mockMkdir = vi.fn()
const mockWriteFile = vi.fn()
const mockReadFile = vi.fn()
const mockAccess = vi.fn()
const mockRm = vi.fn()
const mockReaddir = vi.fn()
const mockCopyFile = vi.fn()
const mockChmod = vi.fn()
const mockStat = vi.fn()
const mockReadlink = vi.fn()
const mockSymlink = vi.fn()

vi.mock('node:fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    constants: { X_OK: 1 },
    promises: {
      mkdir: (...args: unknown[]) => mockMkdir(...args),
      writeFile: (...args: unknown[]) => mockWriteFile(...args),
      readFile: (...args: unknown[]) => mockReadFile(...args),
      access: (...args: unknown[]) => mockAccess(...args),
      rm: (...args: unknown[]) => mockRm(...args),
      readdir: (...args: unknown[]) => mockReaddir(...args),
      copyFile: (...args: unknown[]) => mockCopyFile(...args),
      chmod: (...args: unknown[]) => mockChmod(...args),
      stat: (...args: unknown[]) => mockStat(...args),
      readlink: (...args: unknown[]) => mockReadlink(...args),
      symlink: (...args: unknown[]) => mockSymlink(...args),
    },
  },
}))

describe('NodeService', () => {
  let service: NodeService
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    resetNodeService()
    service = new NodeService()
    vi.clearAllMocks()

    // Save env vars we might modify
    savedEnv.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME
    savedEnv.HOME = process.env.HOME
    savedEnv.LOCALAPPDATA = process.env.LOCALAPPDATA
    savedEnv.USERPROFILE = process.env.USERPROFILE

    // Default mock implementations
    mockExistsSync.mockReturnValue(false)
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue('{}')
    mockAccess.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)
    mockReaddir.mockResolvedValue([])
    mockCopyFile.mockResolvedValue(undefined)
    mockChmod.mockResolvedValue(undefined)
    mockStat.mockResolvedValue({ mode: 0o755 })
  })

  afterEach(() => {
    // Restore env vars
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  describe('getCacheDir', () => {
    it('should return a valid cache directory path', () => {
      const cacheDir = service.getCacheDir()
      expect(cacheDir).toBeDefined()
      expect(typeof cacheDir).toBe('string')
      expect(cacheDir.length).toBeGreaterThan(0)

      // Should contain suisui or SuiSui depending on platform
      const lowerCacheDir = cacheDir.toLowerCase()
      expect(lowerCacheDir).toContain('suisui')
    })

    it('should use XDG_CACHE_HOME on Linux when set', () => {
      // Only test on Linux
      if (process.platform !== 'linux') {
        return
      }

      process.env.XDG_CACHE_HOME = '/custom/cache'
      resetNodeService()
      const testService = new NodeService()

      const cacheDir = testService.getCacheDir()
      expect(cacheDir).toBe('/custom/cache/suisui')
    })

    it('should use HOME/.cache on Linux when XDG_CACHE_HOME not set', () => {
      // Only test on Linux
      if (process.platform !== 'linux') {
        return
      }

      delete process.env.XDG_CACHE_HOME
      process.env.HOME = '/home/testuser'
      resetNodeService()
      const testService = new NodeService()

      const cacheDir = testService.getCacheDir()
      expect(cacheDir).toBe('/home/testuser/.cache/suisui')
    })

    it('should use Library/Caches on macOS', () => {
      // Only test on macOS
      if (process.platform !== 'darwin') {
        return
      }

      process.env.HOME = '/Users/testuser'
      resetNodeService()
      const testService = new NodeService()

      const cacheDir = testService.getCacheDir()
      expect(cacheDir).toBe('/Users/testuser/Library/Caches/SuiSui')
    })

    it('should use LOCALAPPDATA on Windows', () => {
      // Only test on Windows
      if (process.platform !== 'win32') {
        return
      }

      process.env.LOCALAPPDATA = 'C:\\Users\\TestUser\\AppData\\Local'
      resetNodeService()
      const testService = new NodeService()

      const cacheDir = testService.getCacheDir()
      expect(cacheDir).toContain('SuiSui')
    })
  })

  describe('getBundledRuntimePath', () => {
    it('should return null when no bundled runtime exists', () => {
      mockExistsSync.mockReturnValue(false)

      const bundledPath = service.getBundledRuntimePath()
      expect(bundledPath).toBeNull()
    })

    it('should return dev path when it exists', () => {
      mockExistsSync.mockImplementation((p: string) => {
        return p.includes('nodejs-runtime')
      })

      const bundledPath = service.getBundledRuntimePath()
      expect(bundledPath).toContain('nodejs-runtime')
    })
  })

  describe('getRuntimeInfo', () => {
    it('should return null when no runtime info file exists', async () => {
      mockExistsSync.mockReturnValue(false)

      const info = await service.getRuntimeInfo()
      expect(info).toBeNull()
    })

    it('should return parsed runtime info when file exists', async () => {
      const mockInfo = {
        version: '22.13.1',
        extractedAt: '2024-01-01T00:00:00.000Z',
        platform: 'linux',
        arch: 'x64',
        path: '/cache/nodejs-v22.13.1',
      }

      mockExistsSync.mockReturnValue(true)
      mockReadFile.mockResolvedValue(JSON.stringify(mockInfo))

      const info = await service.getRuntimeInfo()
      expect(info).toEqual(mockInfo)
    })
  })

  describe('getNodePath', () => {
    it('should return null when no runtime info', async () => {
      mockExistsSync.mockReturnValue(false)

      const nodePath = await service.getNodePath()
      expect(nodePath).toBeNull()
    })

    it('should return node binary path when runtime info exists', async () => {
      const mockInfo = {
        version: '22.13.1',
        extractedAt: '2024-01-01T00:00:00.000Z',
        platform: process.platform,
        arch: process.arch,
        path: '/cache/nodejs-v22.13.1',
      }

      const expectedBinary = process.platform === 'win32' ? 'node.exe' : 'bin/node'

      mockExistsSync.mockImplementation((p: string) => {
        if (p.includes('runtime-info.json')) return true
        if (p.includes(expectedBinary)) return true
        return false
      })
      mockReadFile.mockResolvedValue(JSON.stringify(mockInfo))

      const nodePath = await service.getNodePath()
      expect(nodePath).toContain('nodejs-v22.13.1')
      // Check for node binary - either node.exe on Windows or node on Unix
      expect(nodePath).toMatch(/node(\.exe)?$/)
    })
  })

  describe('getNpmPath', () => {
    it('should return null when no runtime info', async () => {
      mockExistsSync.mockReturnValue(false)

      const npmPath = await service.getNpmPath()
      expect(npmPath).toBeNull()
    })

    it('should return npm binary path when runtime info exists', async () => {
      const mockInfo = {
        version: '22.13.1',
        extractedAt: '2024-01-01T00:00:00.000Z',
        platform: process.platform,
        arch: process.arch,
        path: '/cache/nodejs-v22.13.1',
      }

      const expectedBinary = process.platform === 'win32' ? 'npm.cmd' : 'bin/npm'

      mockExistsSync.mockImplementation((p: string) => {
        if (p.includes('runtime-info.json')) return true
        if (p.includes(expectedBinary)) return true
        return false
      })
      mockReadFile.mockResolvedValue(JSON.stringify(mockInfo))

      const npmPath = await service.getNpmPath()
      expect(npmPath).toContain('nodejs-v22.13.1')
    })
  })

  describe('verifyRuntime', () => {
    it('should return false when node path not found', async () => {
      mockExistsSync.mockReturnValue(false)

      const isValid = await service.verifyRuntime()
      expect(isValid).toBe(false)
    })

    it('should return true when node binary is executable', async () => {
      const mockInfo = {
        version: '22.13.1',
        extractedAt: '2024-01-01T00:00:00.000Z',
        platform: 'linux',
        arch: 'x64',
        path: '/cache/nodejs-v22.13.1',
      }

      mockExistsSync.mockImplementation((p: string) => {
        if (p.includes('runtime-info.json')) return true
        if (p.includes('bin/node')) return true
        return false
      })
      mockReadFile.mockResolvedValue(JSON.stringify(mockInfo))
      mockAccess.mockResolvedValue(undefined)

      const isValid = await service.verifyRuntime()
      expect(isValid).toBe(true)
    })

    it('should return false when node binary is not executable', async () => {
      const mockInfo = {
        version: '22.13.1',
        extractedAt: '2024-01-01T00:00:00.000Z',
        platform: 'linux',
        arch: 'x64',
        path: '/cache/nodejs-v22.13.1',
      }

      mockExistsSync.mockImplementation((p: string) => {
        if (p.includes('runtime-info.json')) return true
        if (p.includes('bin/node')) return true
        return false
      })
      mockReadFile.mockResolvedValue(JSON.stringify(mockInfo))
      mockAccess.mockRejectedValue(new Error('EACCES'))

      const isValid = await service.verifyRuntime()
      expect(isValid).toBe(false)
    })
  })

  describe('ensureRuntime', () => {
    it('should return success with existing valid runtime', async () => {
      const mockInfo = {
        version: '22.13.1',
        extractedAt: '2024-01-01T00:00:00.000Z',
        platform: 'linux',
        arch: 'x64',
        path: '/cache/nodejs-v22.13.1',
      }

      mockExistsSync.mockImplementation((p: string) => {
        if (p.includes('runtime-info.json')) return true
        if (p.includes('bin/node')) return true
        return false
      })
      mockReadFile.mockResolvedValue(JSON.stringify(mockInfo))
      mockAccess.mockResolvedValue(undefined)

      const result = await service.ensureRuntime()
      expect(result.success).toBe(true)
      expect(result.runtimeInfo).toEqual(mockInfo)
    })

    it('should return error when bundled runtime not found', async () => {
      mockExistsSync.mockReturnValue(false)

      const result = await service.ensureRuntime()
      expect(result.success).toBe(false)
      expect(result.error).toBe('Bundled Node.js runtime not found')
    })
  })
})
