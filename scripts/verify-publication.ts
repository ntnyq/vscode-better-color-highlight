import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { parseArgs, promisify } from 'node:util'

interface PublicationOptions {
  version: string
  commit: string
  sha256: string
  publisher: string
  name: string
  repository: string
}

interface PublicationCheck {
  service: 'github' | 'marketplace'
  status: 'verified' | 'pending' | 'mismatch' | 'error'
  detail: string
}

class PublicationFailureError extends Error {
  public readonly status: PublicationCheck['status']

  public constructor(status: PublicationCheck['status'], message: string) {
    super(message)
    this.name = 'PublicationFailureError'
    this.status = status
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Unexpected publication response shape')
  }
  return value as Record<string, unknown>
}

function requireMatch(condition: boolean, message: string): void {
  if (!condition) {
    throw new PublicationFailureError('mismatch', message)
  }
}

async function check(
  service: PublicationCheck['service'],
  verify: () => Promise<string>,
): Promise<PublicationCheck> {
  try {
    return { service, status: 'verified', detail: await verify() }
  } catch (error) {
    return {
      service,
      status: error instanceof PublicationFailureError ? error.status : 'error',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Read public publication evidence without uploading, tagging, or retrying a
 * release. Missing public data and temporary service failures remain pending.
 */
export async function verifyPublication(
  options: PublicationOptions,
  request: typeof fetch = fetch,
) {
  if (
    !/^\d+\.\d+\.\d+$/u.test(options.version) ||
    !/^[a-f\d]{40}$/u.test(options.commit) ||
    !/^[a-f\d]{64}$/u.test(options.sha256) ||
    !/^[\w-]+\/[\w.-]+$/u.test(options.repository) ||
    !/^[\w-]+$/u.test(options.publisher) ||
    !/^[\w-]+$/u.test(options.name)
  ) {
    throw new Error(
      'Expected a stable version, full commit SHA, SHA-256, and valid extension/repository identifiers',
    )
  }

  async function get(url: string, init: RequestInit = {}) {
    let response: Response
    try {
      response = await request(url, {
        ...init,
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      throw new PublicationFailureError(
        'pending',
        `Public service unavailable: ${String(error)}`,
      )
    }
    if (!response.ok) {
      const status =
        response.status === 404 ||
        response.status === 429 ||
        response.status >= 500
          ? 'pending'
          : 'error'
      throw new PublicationFailureError(
        status,
        `HTTP ${response.status}: ${url}`,
      )
    }
    return response
  }

  async function getJson(url: string, init: RequestInit = {}) {
    const response = await get(url, init)
    return record(await response.json())
  }

  const tag = `v${options.version}`
  const checks = await Promise.all([
    check('github', async () => {
      const base = `https://api.github.com/repos/${options.repository}`
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
      }
      // Authentication is sent only to GitHub's API, never Marketplace or CDN.
      if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
      }
      const release = await getJson(`${base}/releases/tags/${tag}`, { headers })
      requireMatch(
        release.tag_name === tag &&
          release.draft === false &&
          release.prerelease === false &&
          typeof release.published_at === 'string',
        'GitHub release is not the expected public stable release',
      )
      const ref = await getJson(`${base}/git/ref/tags/${tag}`, { headers })
      let object = record(ref.object)
      for (let depth = 0; object.type === 'tag' && depth < 5; depth++) {
        if (
          typeof object.sha !== 'string' ||
          !/^[a-f\d]{40}$/u.test(object.sha)
        ) {
          throw new Error('Invalid annotated tag SHA')
        }
        const annotated = await getJson(`${base}/git/tags/${object.sha}`, {
          headers,
        })
        object = record(annotated.object)
      }
      requireMatch(
        object.type === 'commit' && object.sha === options.commit,
        'GitHub tag resolves to a different commit',
      )
      const manifest = await getJson(
        `https://raw.githubusercontent.com/${options.repository}/${options.commit}/package.json`,
      )
      requireMatch(
        manifest.version === options.version &&
          manifest.publisher === options.publisher &&
          manifest.name === options.name,
        'Tagged package identity/version does not match the release',
      )
      return `${tag} is public and resolves to ${options.commit}; tagged manifest matches`
    }),
    check('marketplace', async () => {
      const identifier = `${options.publisher}.${options.name}`
      const gallery = await getJson(
        'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json;api-version=7.2-preview.1',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filters: [
              {
                criteria: [{ filterType: 7, value: identifier }],
                pageNumber: 1,
                pageSize: 1,
              },
            ],
            // IncludeVersions | ExcludeNonValidated: a downloadable archive
            // alone is insufficient evidence of a validated public listing.
            flags: 33,
          }),
        },
      )
      if (!Array.isArray(gallery.results)) {
        throw new TypeError('Missing gallery results')
      }
      const extensions = record(gallery.results[0]).extensions
      if (!Array.isArray(extensions)) {
        throw new TypeError('Missing gallery extensions')
      }
      const extension = extensions
        .map(record)
        .find(
          item =>
            item.extensionName === options.name &&
            record(item.publisher).publisherName === options.publisher,
        )
      if (!extension) {
        throw new PublicationFailureError(
          'pending',
          'Extension is not publicly listed with validation complete',
        )
      }
      if (!Array.isArray(extension.versions)) {
        throw new TypeError('Missing gallery versions')
      }
      if (
        !extension.versions
          .map(record)
          .some(
            item =>
              item.version === options.version &&
              (item.targetPlatform === undefined ||
                item.targetPlatform === 'universal'),
          )
      ) {
        throw new PublicationFailureError(
          'pending',
          `Marketplace ${options.version} is not publicly validated yet`,
        )
      }
      const download = await get(
        `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${options.publisher}/vsextensions/${options.name}/${options.version}/vspackage`,
      )
      const sha256 = createHash('sha256')
        .update(Buffer.from(await download.arrayBuffer()))
        .digest('hex')
      requireMatch(
        sha256 === options.sha256,
        `Public VSIX SHA-256 mismatch: expected ${options.sha256}, received ${sha256}`,
      )
      return `${identifier}@${options.version} is validated; public VSIX SHA-256 ${sha256}`
    }),
  ])
  const status: PublicationCheck['status'] =
    ['mismatch', 'error', 'pending']
      .map(candidate => checks.find(item => item.status === candidate)?.status)
      .find(candidate => candidate !== undefined) ?? 'verified'
  return {
    status,
    version: options.version,
    commit: options.commit,
    sha256: options.sha256,
    checks,
  }
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({
      options: {
        version: { type: 'string' },
        commit: { type: 'string' },
        sha256: { type: 'string' },
        artifact: { type: 'string' },
        output: { type: 'string' },
      },
    })
    if (values.sha256 && values.artifact) {
      throw new Error('Choose --sha256 or --artifact')
    }
    const manifest = record(JSON.parse(await readFile('package.json', 'utf8')))
    const version = values.version ?? String(manifest.version)
    let commit = values.commit
    if (!commit) {
      const resolved = await promisify(execFile)('git', [
        'rev-parse',
        '--verify',
        `refs/tags/v${version}^{commit}`,
      ])
      commit = resolved.stdout.trim()
    }
    const sha256 =
      values.sha256 ??
      createHash('sha256')
        .update(await readFile(values.artifact ?? 'dist/release.vsix'))
        .digest('hex')
    const repository = record(manifest.repository).url
    if (typeof repository !== 'string') {
      throw new TypeError('Missing GitHub repository')
    }
    const match = repository.match(
      /^git\+https:\/\/github\.com\/(?<repository>[\w-]+\/[\w.-]+)\.git$/u,
    )
    if (!match?.groups) {
      throw new Error('Expected a GitHub repository URL')
    }
    const result = await verifyPublication({
      version,
      commit,
      sha256,
      publisher: String(manifest.publisher),
      name: String(manifest.name),
      repository: match.groups.repository,
    })
    const report = `${JSON.stringify(result, null, 2)}\n`
    if (values.output) {
      await writeFile(values.output, report)
    }
    process.stdout.write(report)
    process.exitCode = { verified: 0, pending: 2, mismatch: 1, error: 1 }[
      result.status
    ]
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
