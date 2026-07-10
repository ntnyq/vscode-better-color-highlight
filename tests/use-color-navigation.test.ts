import type * as ReactiveVscode from 'reactive-vscode'
import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type * as ProviderModule from '../src/color-navigation/definition-provider'

type DisposeFn = () => void
let deactivateHandler: DisposeFn = () => {}
const dispose = vi.fn<DisposeFn>()
const registerDefinitionProvider = vi.fn<
  (selector: unknown, provider: unknown) => { dispose: DisposeFn }
>(() => ({ dispose }))
const provideColorDefinition =
  vi.fn<typeof ProviderModule.provideColorDefinition>()

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
      languages: { registerDefinitionProvider },
    }) as unknown as Partial<typeof Vscode>,
)
vi.mock(import('../src/color-navigation/definition-provider'), () => ({
  provideColorDefinition,
}))

describe('useColorNavigation', () => {
  it('registers every language for runtime filtering and disposes the provider', async () => {
    const { useColorNavigation } =
      await import('../src/composables/use-color-navigation')

    useColorNavigation()

    expect(registerDefinitionProvider).toHaveBeenCalledWith(
      [{ language: '*' }],
      { provideDefinition: provideColorDefinition },
    )
    deactivateHandler()
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
