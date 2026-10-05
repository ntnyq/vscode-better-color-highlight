import { describe, expect, it } from 'vitest'
import { parseAndroidResourceDocument } from '../../../../src/engine/strategies/android-resources/parser'

describe('android resource XML parsing', () => {
  it('preserves UTF-16 declaration, name, and complete reference ranges', () => {
    const text = `<?xml version="1.0"?>
<!-- 🎨 中文 <color name="fake">#000</color> -->
<resources>
  <color name='brand'> #80ff0000 </color>
  <item name="alias" type="color"> @color/brand </item>
  <style name="Theme"><item name="android:textColor">@color/alias</item></style>
</resources>`
    const parsed = parseAndroidResourceDocument(text, true)
    expect(
      parsed?.declarations.map(declaration => ({
        name: text.slice(
          declaration.nameRange.start,
          declaration.nameRange.end,
        ),
        value: declaration.value,
        source: text.slice(declaration.range.start, declaration.range.end),
      })),
    ).toStrictEqual([
      {
        name: 'brand',
        value: '#80ff0000',
        source: "<color name='brand'> #80ff0000 </color>",
      },
      {
        name: 'alias',
        value: '@color/brand',
        source: '<item name="alias" type="color"> @color/brand </item>',
      },
    ])
    expect(
      parsed?.references.map(reference =>
        text.slice(reference.start, reference.end),
      ),
    ).toStrictEqual(['@color/brand', '@color/alias'])
  })

  it('accepts complete XML attribute values but skips comments, tooling, expressions and packages', () => {
    const parsed = parseAndroidResourceDocument(
      `<TextView
      android:textColor="@color/brand" background=' @color/Accent '
      tools:textColor="@color/preview" xmlns:color="@color/namespace"
      invalid="prefix @color/brand" binding="@{condition ? @color/brand : @color/other}"
      system="@android:color/white" escaped="\\@color/brand" encoded="&#64;color/brand"
      uppercase="@COLOR/brand" /> <!-- @color/comment -->`,
      false,
    )
    expect(parsed?.references.map(reference => reference.name)).toStrictEqual([
      'brand',
      'Accent',
    ])
  })

  it.each([
    '<resources><color name="brand">#fff</resources>',
    '<resources><color name="brand" name="duplicate">#fff</color></resources>',
    '<resources><color name="brand"name="duplicate">#fff</color></resources>',
    '<resources><color name="brand">#fff</color>',
    '<resources/><resources/>',
    '<!DOCTYPE resources><resources/>',
    '<resources><color name="brand"><![CDATA[unfinished</color></resources>',
    '<resources><!-- unfinished',
    '<resources><color name="br&#97;nd">#fff</color></resources>',
    '<resources><item type="co&#108;or" name="brand">#fff</item></resources>',
    '<resources><color>#fff</color></resources>',
    '<resources>text</resources>trailing',
  ])('rejects unsupported or malformed documents: %s', text => {
    expect(parseAndroidResourceDocument(text, true)).toBeNull()
  })

  it('retains unsupported color declarations so they can block aliases', () => {
    const parsed = parseAndroidResourceDocument(
      '<resources><color name="dynamic"><nested/></color><color name="empty"/></resources>',
      true,
    )
    expect(
      parsed?.declarations.map(({ name, value }) => ({ name, value })),
    ).toStrictEqual([
      { name: 'dynamic', value: null },
      { name: 'empty', value: '' },
    ])
  })

  it('skips CDATA contents without discarding unrelated static declarations', () => {
    const parsed = parseAndroidResourceDocument(
      '<resources><string name="markup"><![CDATA[<color name="brand">#000</color> @color/ignored]]></string><color name="brand">#fff</color><color name="unsupported"><![CDATA[#000]]></color></resources>',
      true,
    )
    expect(
      parsed?.declarations.map(({ name, value }) => ({ name, value })),
    ).toStrictEqual([
      { name: 'brand', value: '#fff' },
      { name: 'unsupported', value: null },
    ])
    expect(parsed?.references).toStrictEqual([])
  })

  it('bounds nesting and rejects non-resource roots for values files', () => {
    expect(
      parseAndroidResourceDocument(
        '<node>'.repeat(129) + '</node>'.repeat(129),
        false,
      ),
    ).toBeNull()
    expect(parseAndroidResourceDocument('<selector/>', true)).toBeNull()
    expect(
      parseAndroidResourceDocument(
        `<resources>${'<color name="brand">#fff</color>'.repeat(20_001)}</resources>`,
        true,
      ),
    ).toBeNull()
    expect(
      parseAndroidResourceDocument(
        `<resources><${'color'.repeat(20_000)}`,
        true,
      ),
    ).toBeNull()
  })
})
