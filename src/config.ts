import { defineConfig } from 'reactive-vscode'
import { scopedConfigs, type NestedScopedConfigs } from './meta'

/**
 * Reactive VS Code configuration accessor scoped to this extension.
 */
export const config = defineConfig<NestedScopedConfigs>(scopedConfigs.scope)
