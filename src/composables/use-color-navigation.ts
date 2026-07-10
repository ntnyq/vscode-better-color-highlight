import { onDeactivate } from 'reactive-vscode'
import { languages } from 'vscode'
import { provideColorDefinition } from '../color-navigation/definition-provider'

const COLOR_NAVIGATION_SELECTORS = [{ language: '*' }]

/** Register contextual color-variable definition navigation. */
export function useColorNavigation(): void {
  const disposable = languages.registerDefinitionProvider(
    COLOR_NAVIGATION_SELECTORS,
    { provideDefinition: provideColorDefinition },
  )

  onDeactivate(() => {
    disposable.dispose()
  })
}
