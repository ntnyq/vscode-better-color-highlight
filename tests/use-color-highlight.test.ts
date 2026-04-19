import { describe, expect, it } from 'vitest'
import { shouldTrackDocument } from '../src/core/editor-filter'

function createDocument(scheme: string) {
  return {
    uri: {
      scheme,
    },
  } as Parameters<typeof shouldTrackDocument>[0]
}

describe(shouldTrackDocument, () => {
  it('tracks regular editable documents', () => {
    expect(shouldTrackDocument(createDocument('file'))).toBe(true)
    expect(shouldTrackDocument(createDocument('untitled'))).toBe(true)
    expect(shouldTrackDocument(createDocument('vscode-remote'))).toBe(true)
  })

  it('excludes output and debug-like documents', () => {
    expect(shouldTrackDocument(createDocument('output'))).toBe(false)
    expect(shouldTrackDocument(createDocument('debug-console'))).toBe(false)
    expect(shouldTrackDocument(createDocument('vscode-terminal'))).toBe(false)
  })
})
