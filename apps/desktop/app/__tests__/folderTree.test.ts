import { describe, it, expect } from 'vitest'
import { buildFolderTree } from '../utils/folderTree'

describe('buildFolderTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildFolderTree([])).toEqual([])
  })

  it('creates a single root node', () => {
    const result = buildFolderTree(['features'])
    expect(result).toHaveLength(1)
    expect(result[0]!.key).toBe('features')
    expect(result[0]!.label).toBe('features')
    expect(result[0]!.children).toEqual([])
  })

  it('creates nested folder hierarchy', () => {
    const result = buildFolderTree([
      'features',
      'features/auth',
      'features/auth/login',
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.key).toBe('features')
    expect(result[0]!.children).toHaveLength(1)

    const auth = result[0]!.children![0]!
    expect(auth.key).toBe('features/auth')
    expect(auth.label).toBe('auth')
    expect(auth.children).toHaveLength(1)

    const login = auth.children![0]!
    expect(login.key).toBe('features/auth/login')
    expect(login.label).toBe('login')
    expect(login.children).toEqual([])
  })

  it('creates multiple root folders', () => {
    const result = buildFolderTree(['src', 'tests', 'docs'])
    expect(result).toHaveLength(3)
    expect(result.map((n) => n.key)).toEqual(['docs', 'src', 'tests']) // sorted
  })

  it('handles multiple branches under one root', () => {
    const result = buildFolderTree([
      'features',
      'features/auth',
      'features/checkout',
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.children).toHaveLength(2)
    expect(result[0]!.children!.map((n) => n.key)).toEqual([
      'features/auth',
      'features/checkout',
    ])
  })

  it('handles single deep path', () => {
    const result = buildFolderTree([
      'a',
      'a/b',
      'a/b/c',
      'a/b/c/d',
    ])
    expect(result).toHaveLength(1)
    let node = result[0]!
    expect(node.key).toBe('a')
    node = node.children![0]!
    expect(node.key).toBe('a/b')
    node = node.children![0]!
    expect(node.key).toBe('a/b/c')
    node = node.children![0]!
    expect(node.key).toBe('a/b/c/d')
    expect(node.children).toEqual([])
  })

  it('treats folders without matching parent as roots', () => {
    // If parent folder path is not in the list, treat as root
    const result = buildFolderTree(['features/auth', 'features/checkout'])
    expect(result).toHaveLength(2)
    expect(result.map((n) => n.key)).toEqual(['features/auth', 'features/checkout'])
  })

  it('sets folder icon on all nodes', () => {
    const result = buildFolderTree(['features', 'features/auth'])
    expect(result[0]!.icon).toBe('pi pi-folder')
    expect(result[0]!.children![0]!.icon).toBe('pi pi-folder')
  })
})
