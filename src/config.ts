import { defineConfig } from 'reactive-vscode'
import type { NestedConfigs } from './meta'

export const config = defineConfig<NestedConfigs>('color-highlight')

/**
 * Get the color-highlight namespace from config.
 * The defineConfig<NestedConfigs> creates a nested structure
 * where color-highlight properties are under the 'color-highlight' key.
 */
function getNs() {
  return config['color-highlight']
}

/**
 * Get the current highlight config as a typed object.
 * Reads from reactive config values.
 */
export function getHighlightConfig() {
  const ns = getNs()
  return {
    enable: ns.enable,
    languages: ns.languages,
    matchWords: ns.matchWords,
    useARGB: ns.useARGB,
    matchRgbWithNoFunction: ns.matchRgbWithNoFunction,
    rgbWithNoFunctionLanguages: ns.rgbWithNoFunctionLanguages,
    matchHslWithNoFunction: ns.matchHslWithNoFunction,
    hslWithNoFunctionLanguages: ns.hslWithNoFunctionLanguages,
    markerType: ns.markerType,
    markRuler: ns.markRuler,
    debug: ns.debug,
  }
}
