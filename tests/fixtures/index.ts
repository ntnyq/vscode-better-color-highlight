import { readFileSync } from 'node:fs'

function readFixture(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const FIXTURE_CSS = readFixture('../../playground/css.css')
const FIXTURE_HTML = readFixture('../../playground/index.html')
const FIXTURE_SCSS = readFixture('../../playground/scss.scss')
const FIXTURE_LESS = readFixture('../../playground/less.less')
const FIXTURE_STYLUS = readFixture('../../playground/stylus.styl')
const FIXTURE_TS = readFixture('../../playground/index.ts')

const FIXTURE_VARS_CSS = readFixture('../../playground/vars.css')
const FIXTURE_SIMPLE_CSS = readFixture('../../playground/simple.css')

export {
  FIXTURE_CSS,
  FIXTURE_HTML,
  FIXTURE_SCSS,
  FIXTURE_LESS,
  FIXTURE_STYLUS,
  FIXTURE_TS,

  FIXTURE_VARS_CSS,
  FIXTURE_SIMPLE_CSS,
}
