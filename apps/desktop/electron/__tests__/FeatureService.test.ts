import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FeatureTreeNode, FeatureFile } from '@suisui/shared' // eslint-disable-line @typescript-eslint/no-unused-vars
import { FeatureService } from '../services/FeatureService'
import { WorkspaceService } from '../services/WorkspaceService' // eslint-disable-line @typescript-eslint/no-unused-vars
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// Mock WorkspaceService
vi.mock('../services/WorkspaceService', () => ({
  getWorkspaceService: vi.fn(),
}))

describe('FeatureService', () => {
  let tempDir: string
  let featureService: FeatureService
  let workspaceService: { getPath: () => string; getFeaturesDir: (workspacePath?: string) => Promise<string> }

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'suisui-test-'))
    
    // Mock workspace service
    const { getWorkspaceService } = await import('../services/WorkspaceService')
    workspaceService = {
      getPath: () => tempDir,
      getFeaturesDir: async () => 'features',
    }
    vi.mocked(getWorkspaceService).mockReturnValue(workspaceService)

    featureService = new FeatureService()

    // Create features directory
    await fs.mkdir(path.join(tempDir, 'features'), { recursive: true })
  })

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('list', () => {
    it('should list feature files', async () => {
      await fs.writeFile(path.join(tempDir, 'features', 'test.feature'), 'Feature: Test')
      const features = await featureService.list()
      expect(features).toHaveLength(1)
      expect(features[0].name).toBe('test')
      expect(features[0].relativePath).toBe('test.feature')
    })

    it('should list nested feature files', async () => {
      await fs.mkdir(path.join(tempDir, 'features', 'auth'), { recursive: true })
      await fs.writeFile(path.join(tempDir, 'features', 'auth', 'login.feature'), 'Feature: Login')
      const features = await featureService.list()
      expect(features).toHaveLength(1)
      expect(features[0].relativePath).toBe('auth/login.feature')
    })

    it('should ignore non-feature files', async () => {
      await fs.writeFile(path.join(tempDir, 'features', 'readme.md'), '# Readme')
      const features = await featureService.list()
      expect(features).toHaveLength(0)
    })
  })

  describe('getTree', () => {
    it('should return empty tree when no features', async () => {
      const tree = await featureService.getTree()
      expect(tree).toEqual([])
    })

    it('should return flat structure for root features', async () => {
      await fs.writeFile(path.join(tempDir, 'features', 'test.feature'), 'Feature: Test')
      const tree = await featureService.getTree()
      
      expect(tree).toHaveLength(1)
      expect(tree[0].type).toBe('file')
      expect(tree[0].name).toBe('test')
      expect(tree[0].relativePath).toBe('test.feature')
    })

    it('should return tree structure with folders', async () => {
      await fs.mkdir(path.join(tempDir, 'features', 'auth'), { recursive: true })
      await fs.writeFile(path.join(tempDir, 'features', 'auth', 'login.feature'), 'Feature: Login')
      await fs.writeFile(path.join(tempDir, 'features', 'home.feature'), 'Feature: Home')

      const tree = await featureService.getTree()
      
      // Root should have folder and file
      expect(tree).toHaveLength(2)
      
      const folder = tree.find(n => n.type === 'folder')
      expect(folder).toBeDefined()
      expect(folder?.name).toBe('auth')
      expect(folder?.children).toHaveLength(1)
      expect(folder?.children?.[0].name).toBe('login')
    })

    it('should sort folders before files', async () => {
      await fs.mkdir(path.join(tempDir, 'features', 'z-folder'), { recursive: true })
      await fs.writeFile(path.join(tempDir, 'features', 'a.feature'), 'Feature: A')

      const tree = await featureService.getTree()
      
      expect(tree[0].type).toBe('folder')
      expect(tree[1].type).toBe('file')
    })
  })

  describe('createFolder', () => {
    it('should create a folder', async () => {
      await featureService.createFolder('auth')
      const exists = await fs.stat(path.join(tempDir, 'features', 'auth'))
      expect(exists.isDirectory()).toBe(true)
    })

    it('should create nested folders', async () => {
      await featureService.createFolder('auth/admin')
      const exists = await fs.stat(path.join(tempDir, 'features', 'auth', 'admin'))
      expect(exists.isDirectory()).toBe(true)
    })

    it('should reject invalid paths', async () => {
      await expect(featureService.createFolder('../evil')).rejects.toThrow()
    })
  })

  describe('renameFolder', () => {
    it('should rename a folder', async () => {
      await fs.mkdir(path.join(tempDir, 'features', 'old'), { recursive: true })
      await featureService.renameFolder('old', 'new')
      
      expect(await fs.stat(path.join(tempDir, 'features', 'new'))).toBeDefined()
      await expect(fs.stat(path.join(tempDir, 'features', 'old'))).rejects.toThrow()
    })

    it('should throw error if folder does not exist', async () => {
      await expect(featureService.renameFolder('nonexistent', 'new')).rejects.toThrow()
    })
  })

  describe('deleteFolder', () => {
    it('should delete empty folder', async () => {
      await fs.mkdir(path.join(tempDir, 'features', 'todelete'), { recursive: true })
      await featureService.deleteFolder('todelete')
      
      await expect(fs.stat(path.join(tempDir, 'features', 'todelete'))).rejects.toThrow()
    })

    it('should delete folder with files', async () => {
      await fs.mkdir(path.join(tempDir, 'features', 'todelete'), { recursive: true })
      await fs.writeFile(path.join(tempDir, 'features', 'todelete', 'test.feature'), 'Feature: Test')
      await featureService.deleteFolder('todelete')
      
      await expect(fs.stat(path.join(tempDir, 'features', 'todelete'))).rejects.toThrow()
    })
  })

  describe('renameFeature', () => {
    it('should rename a feature file', async () => {
      await fs.writeFile(path.join(tempDir, 'features', 'old.feature'), 'Feature: Old')
      await featureService.renameFeature('old.feature', 'new.feature')
      
      expect(await fs.stat(path.join(tempDir, 'features', 'new.feature'))).toBeDefined()
      await expect(fs.stat(path.join(tempDir, 'features', 'old.feature'))).rejects.toThrow()
    })

    it('should throw error if file does not exist', async () => {
      await expect(featureService.renameFeature('nonexistent.feature', 'new.feature')).rejects.toThrow()
    })

    it('should reject non-feature files', async () => {
      await expect(featureService.renameFeature('file.txt', 'new.txt')).rejects.toThrow()
    })
  })

  describe('moveFeature', () => {
    it('should move feature to folder', async () => {
      await fs.writeFile(path.join(tempDir, 'features', 'test.feature'), 'Feature: Test')
      await fs.mkdir(path.join(tempDir, 'features', 'auth'), { recursive: true })
      
      await featureService.moveFeature('test.feature', 'auth')
      
      expect(await fs.stat(path.join(tempDir, 'features', 'auth', 'test.feature'))).toBeDefined()
      await expect(fs.stat(path.join(tempDir, 'features', 'test.feature'))).rejects.toThrow()
    })

    it('should move feature within folders', async () => {
      await fs.mkdir(path.join(tempDir, 'features', 'auth'), { recursive: true })
      await fs.mkdir(path.join(tempDir, 'features', 'users'), { recursive: true })
      await fs.writeFile(path.join(tempDir, 'features', 'auth', 'login.feature'), 'Feature: Login')
      
      await featureService.moveFeature('auth/login.feature', 'users')
      
      expect(await fs.stat(path.join(tempDir, 'features', 'users', 'login.feature'))).toBeDefined()
    })
  })

  describe('copyFeature', () => {
    it('should copy feature file', async () => {
      const originalContent = 'Feature: Original\n  Scenario: Test\n    Given something'
      await fs.writeFile(path.join(tempDir, 'features', 'original.feature'), originalContent)
      
      await featureService.copyFeature('original.feature', 'copy.feature')
      
      const copied = await fs.readFile(path.join(tempDir, 'features', 'copy.feature'), 'utf-8')
      expect(copied).toBe(originalContent)
    })

    it('should copy to nested folder', async () => {
      const originalContent = 'Feature: Test'
      await fs.writeFile(path.join(tempDir, 'features', 'original.feature'), originalContent)
      
      await featureService.copyFeature('original.feature', 'auth/copy.feature')
      
      const copied = await fs.readFile(path.join(tempDir, 'features', 'auth', 'copy.feature'), 'utf-8')
      expect(copied).toBe(originalContent)
    })

    it('should preserve gherkin content exactly', async () => {
      const gherkinContent = `Feature: Login Feature
  Description of the feature

  Background:
    Given user is on home page

  Scenario: Successful login
    Given user is on login page
    When user enters credentials
    Then user should be logged in`
      
      await fs.writeFile(path.join(tempDir, 'features', 'login.feature'), gherkinContent)
      await featureService.copyFeature('login.feature', 'login-copy.feature')
      
      const copied = await fs.readFile(path.join(tempDir, 'features', 'login-copy.feature'), 'utf-8')
      expect(copied).toBe(gherkinContent)
    })

    it('should throw error if source does not exist', async () => {
      await expect(featureService.copyFeature('nonexistent.feature', 'copy.feature')).rejects.toThrow()
    })

    it('should reject invalid paths', async () => {
      await expect(featureService.copyFeature('../evil.feature', 'copy.feature')).rejects.toThrow()
    })
  })

  describe('read and write', () => {
    it('should read feature file', async () => {
      const content = 'Feature: Test'
      await fs.writeFile(path.join(tempDir, 'features', 'test.feature'), content)
      
      const read = await featureService.read('test.feature')
      expect(read).toBe(content)
    })

    it('should write feature file', async () => {
      const content = 'Feature: New Feature'
      await featureService.write('new.feature', content)
      
      const read = await fs.readFile(path.join(tempDir, 'features', 'new.feature'), 'utf-8')
      expect(read).toBe(content)
    })

    it('should create parent folders when writing', async () => {
      const content = 'Feature: Nested'
      await featureService.write('auth/admin/nested.feature', content)
      
      const read = await fs.readFile(path.join(tempDir, 'features', 'auth', 'admin', 'nested.feature'), 'utf-8')
      expect(read).toBe(content)
    })
  })

  describe('path validation', () => {
    it('should reject parent directory traversal', async () => {
      await expect(featureService.read('../outside.feature')).rejects.toThrow()
    })

    it('should reject absolute paths', async () => {
      await expect(featureService.read('/etc/passwd.feature')).rejects.toThrow()
    })

    it('should reject non-feature files', async () => {
      await expect(featureService.read('file.txt')).rejects.toThrow()
    })

    it('should accept valid relative paths', async () => {
      await featureService.write('valid.feature', 'Feature: Valid')
      expect(await featureService.exists('valid.feature')).toBe(true)
    })
  })
})
