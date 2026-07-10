import { onDeactivate } from 'reactive-vscode'
import { languages } from 'vscode'
import {
  provideColorPresentations,
  provideDocumentColors,
} from '../color-provider/document-color-provider'

/**
 * Register VS Code's optional native document color provider.
 */
export function useColorProvider(): void {
  const disposable = languages.registerColorProvider('*', {
    provideColorPresentations,
    provideDocumentColors,
  })

  onDeactivate(() => {
    disposable.dispose()
  })
}
