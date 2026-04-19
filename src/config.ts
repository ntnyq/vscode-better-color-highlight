import { defineConfig } from 'reactive-vscode'
import { scopedConfigs, type NestedScopedConfigs } from './meta'

export const config = defineConfig<NestedScopedConfigs>(scopedConfigs.scope)
