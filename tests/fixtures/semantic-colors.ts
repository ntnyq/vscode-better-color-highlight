/**
 * Color ranges whose surrounding syntax cannot accept a generic CSS replacement.
 */
export const semanticColorFixtures = [
  {
    languageId: 'json',
    text: '{"brand":{"$type":"color","$value":{"colorSpace":"srgb","components":[1,0,0]}}}',
    source: '[1,0,0]',
  },
  {
    languageId: 'yaml',
    text: 'brand:\n  $type: color\n  $value:\n    colorSpace: srgb\n    components: [1, 0, 0]',
    source: '[1, 0, 0]',
  },
  {
    languageId: 'html',
    text: '<div class="bg-red-500">Hello</div>',
    source: 'bg-red-500',
  },
  {
    languageId: 'css',
    text: ':root { --brand-rgb: 255 0 0; }',
    source: '--brand-rgb: 255 0 0;',
  },
]
