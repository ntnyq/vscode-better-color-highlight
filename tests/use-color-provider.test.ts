import type * as ReactiveVscode from 'reactive-vscode'
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type * as ProviderModule from '../src/color-provider/document-color-provider'

type DisposeFn = () => void

let deactivateHandler: DisposeFn = () => {}
const dispose = vi.fn<DisposeFn>()
const registerColorProvider = vi.fn<
  (selector: unknown, provider: unknown) => { dispose: DisposeFn }
>(() => ({ dispose }))
const provideDocumentColors =
  vi.fn<typeof ProviderModule.provideDocumentColors>()
const provideColorPresentations =
  vi.fn<typeof ProviderModule.provideColorPresentations>()

vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      onDeactivate: (handler: DisposeFn) => {
        deactivateHandler = handler
      },
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(
  import('vscode'),
  () =>
    ({
      languages: { registerColorProvider },
    }) as unknown as Partial<typeof Vscode>,
)

vi.mock(import('../src/color-provider/document-color-provider'), () => ({
  provideColorPresentations,
  provideDocumentColors,
}))

describe('useColorProvider', () => {
  it('registers and disposes the native provider', async () => {
    const { useColorProvider } =
      await import('../src/composables/use-color-provider')

    useColorProvider()

    expect(registerColorProvider).toHaveBeenCalledWith('*', {
      provideColorPresentations,
      provideDocumentColors,
    })

    deactivateHandler()
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
