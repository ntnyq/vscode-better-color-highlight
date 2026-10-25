import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { verifyPublication } from '../../scripts/verify-publication'

const ARTIFACT = Buffer.from('the exact tested VSIX bytes')
const OPTIONS = {
  version: '0.9.0',
  commit: 'a'.repeat(40),
  sha256: createHash('sha256').update(ARTIFACT).digest('hex'),
  publisher: 'ntnyq',
  name: 'vscode-better-color-highlight',
  repository: 'ntnyq/vscode-better-color-highlight',
}

function responses() {
  return new Map<string, unknown>([
    [
      'releases/tags/v0.9.0',
      {
        tag_name: 'v0.9.0',
        draft: false,
        prerelease: false,
        published_at: '2026-10-25T05:13:22Z',
      },
    ],
    ['git/ref/tags/v0.9.0', { object: { type: 'tag', sha: 'b'.repeat(40) } }],
    [
      `git/tags/${'b'.repeat(40)}`,
      { object: { type: 'commit', sha: OPTIONS.commit } },
    ],
    [
      'package.json',
      {
        name: OPTIONS.name,
        publisher: OPTIONS.publisher,
        version: OPTIONS.version,
      },
    ],
    [
      'extensionquery',
      {
        results: [
          {
            extensions: [
              {
                extensionName: OPTIONS.name,
                publisher: { publisherName: OPTIONS.publisher },
                versions: [
                  { version: OPTIONS.version, targetPlatform: 'universal' },
                ],
              },
            ],
          },
        ],
      },
    ],
    ['vspackage', ARTIFACT],
  ])
}

function requester(data = responses()) {
  return vi.fn<typeof fetch>(url => {
    const entry = [...data].find(([suffix]) => String(url).endsWith(suffix))
    if (!entry) {
      throw new Error(`Unexpected request ${url}`)
    }
    const value = entry[1]
    if (value instanceof Error) {
      throw value
    }
    if (value instanceof Response) {
      return Promise.resolve(value)
    }
    return Promise.resolve(
      new Response(Buffer.isBuffer(value) ? value : JSON.stringify(value)),
    )
  })
}

describe('read-only public release verification', () => {
  it('verifies the public stable release, peeled tag, manifest, and exact VSIX', async () => {
    const request = requester()
    await expect(verifyPublication(OPTIONS, request)).resolves.toMatchObject({
      status: 'verified',
      checks: [
        { service: 'github', status: 'verified' },
        { service: 'marketplace', status: 'verified' },
      ],
    })
    expect(request).toHaveBeenCalledTimes(6)
    const galleryCall = request.mock.calls.find(([url]) =>
      String(url).endsWith('extensionquery'),
    )
    expect(galleryCall?.[1]?.method).toBe('POST')
    const body = JSON.parse(String(galleryCall?.[1]?.body))
    expect(body.flags).toBe(33)
    expect(body.filters[0].criteria).toStrictEqual([
      { filterType: 7, value: `${OPTIONS.publisher}.${OPTIONS.name}` },
    ])
    const externalCalls = request.mock.calls.filter(
      ([url]) => !String(url).startsWith('https://api.github.com/'),
    )
    for (const [, init] of externalCalls) {
      expect(init?.headers ?? {}).not.toHaveProperty('Authorization')
    }
    for (const [, init] of request.mock.calls) {
      expect(['GET', 'POST']).toContain(init?.method ?? 'GET')
    }
  })

  it('supports lightweight tags', async () => {
    const data = responses()
    data.set('git/ref/tags/v0.9.0', {
      object: { type: 'commit', sha: OPTIONS.commit },
    })
    await expect(
      verifyPublication(OPTIONS, requester(data)),
    ).resolves.toHaveProperty('status', 'verified')
  })

  it.each([
    ['releases/tags/v0.9.0', new Response('', { status: 404 }), 'pending'],
    ['releases/tags/v0.9.0', new Response('', { status: 429 }), 'pending'],
    ['releases/tags/v0.9.0', new Response('', { status: 503 }), 'pending'],
    ['releases/tags/v0.9.0', new Response('', { status: 403 }), 'error'],
    ['releases/tags/v0.9.0', new Error('network timeout'), 'pending'],
    [
      'releases/tags/v0.9.0',
      { tag_name: 'v0.9.0', draft: true, prerelease: false },
      'mismatch',
    ],
    [
      'releases/tags/v0.9.0',
      { tag_name: 'v0.9.1', draft: false, prerelease: false },
      'mismatch',
    ],
    [
      'git/ref/tags/v0.9.0',
      { object: { type: 'commit', sha: 'c'.repeat(40) } },
      'mismatch',
    ],
    ['package.json', { ...OPTIONS, version: '0.8.0' }, 'mismatch'],
    ['extensionquery', { results: [{ extensions: [] }] }, 'pending'],
    [
      'extensionquery',
      {
        results: [
          {
            extensions: [
              {
                extensionName: OPTIONS.name,
                publisher: { publisherName: OPTIONS.publisher },
                versions: [{ version: '0.8.0' }],
              },
            ],
          },
        ],
      },
      'pending',
    ],
    [
      'extensionquery',
      {
        results: [
          {
            extensions: [
              {
                extensionName: OPTIONS.name,
                publisher: { publisherName: 'someone-else' },
                versions: [{ version: OPTIONS.version }],
              },
            ],
          },
        ],
      },
      'pending',
    ],
    ['extensionquery', { results: [] }, 'error'],
    ['vspackage', Buffer.from('a different build'), 'mismatch'],
    ['vspackage', new Response('', { status: 404 }), 'pending'],
  ])(
    'reports %s failures without claiming verification',
    async (key, value, status) => {
      const data = responses()
      data.set(key, value)
      const result = await verifyPublication(OPTIONS, requester(data))
      expect(result.status).toBe(status)
      expect(result.checks.some(item => item.status === 'verified')).toBe(true)
    },
  )

  it('reports a hash mismatch even when GitHub is still synchronizing', async () => {
    const data = responses()
    data.set('releases/tags/v0.9.0', new Response('', { status: 404 }))
    data.set('vspackage', Buffer.from('different'))
    await expect(
      verifyPublication(OPTIONS, requester(data)),
    ).resolves.toHaveProperty('status', 'mismatch')
  })

  it.each([
    { version: '0.9.0;echo injected' },
    { commit: 'main' },
    { sha256: 'bad' },
    { repository: '../another/repository' },
    { publisher: 'name/path' },
  ])(
    'rejects invalid expected evidence before requesting public services: %j',
    async overrides => {
      const request = requester()
      await expect(
        verifyPublication({ ...OPTIONS, ...overrides }, request),
      ).rejects.toThrow('Expected a stable version')
      expect(request).not.toHaveBeenCalled()
    },
  )
})
