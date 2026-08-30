import assert from 'node:assert/strict'
import test from 'node:test'
import { createThemeTransition, getRevealGeometry } from '../src/utils/themeTransition.ts'
import { initializeTheme, THEME_STORAGE_KEY } from '../src/utils/theme.ts'

function environment(t, { reduced = false, systemDark = false } = {}) {
  const classes = new Set()
  const values = new Map()
  const root = {
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
    },
    dataset: {},
    style: { setProperty() {} },
  }
  const doc = { documentElement: root, visibilityState: 'visible' }
  const win = {
    innerWidth: 1440, innerHeight: 900,
    matchMedia: query => ({ matches: query.includes('reduced-motion') ? reduced : systemDark }),
    getComputedStyle: () => ({ backgroundColor: 'white' }),
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
  }
  const previous = { document: globalThis.document, window: globalThis.window }
  globalThis.document = doc
  globalThis.window = win
  t.after(() => {
    globalThis.document = previous.document
    globalThis.window = previous.window
  })
  return { doc, win, root, classes, values }
}

const origin = { getBoundingClientRect: () => ({ left: 230, top: 80, width: 40, height: 40 }) }

test('reveal starts at control center and reaches every viewport corner', () => {
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
    const { x, y, radius } = getRevealGeometry(origin.getBoundingClientRect(), width, height)
    assert.equal(x, 250)
    assert.equal(y, 100)
    for (const [cx, cy] of [[0, 0], [width, 0], [0, height], [width, height]]) {
      assert.ok(Math.hypot(cx - x, cy - y) <= radius)
    }
  }
})

test('fallback commits synchronously and cleans up color-only transition', t => {
  const { classes } = environment(t)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const transition = createThemeTransition()
  let committed = false
  transition.run(() => { committed = true }, origin)
  assert.equal(committed, true)
  assert.equal(classes.has('theme-colors-changing'), true)
  t.mock.timers.tick(300)
  assert.equal(classes.size, 0)
})

test('reduced motion commits without snapshots or animated color fallback', t => {
  const { doc, classes } = environment(t, { reduced: true })
  doc.startViewTransition = () => { throw new Error('must not be called') }
  let count = 0
  createThemeTransition().run(() => count++, origin)
  assert.equal(count, 1)
  assert.equal(classes.size, 0)
})

test('API exceptions still apply the requested theme', t => {
  const { doc } = environment(t)
  doc.startViewTransition = () => { throw new Error('snapshot unsupported') }
  const transition = createThemeTransition()
  let count = 0
  transition.run(() => count++, origin)
  assert.equal(count, 1)
  transition.cancel()
})

test('rapid clicks cannot commit an older pending snapshot callback', async t => {
  const { doc, classes } = environment(t)
  const callbacks = []
  doc.startViewTransition = update => {
    callbacks.push(update)
    return { skipTransition() {}, ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: Promise.resolve() }
  }
  const committed = []
  const transition = createThemeTransition()
  transition.run(() => committed.push('dark'), origin)
  transition.run(() => committed.push('light'), origin)
  callbacks[0]()
  callbacks[1]()
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(committed, ['light'])
  assert.equal(classes.size, 0)
})

test('a rejected snapshot falls back without leaving a reveal layer', async t => {
  const { doc, classes } = environment(t)
  doc.startViewTransition = () => ({
    skipTransition() {}, ready: Promise.reject(new Error('snapshot skipped')),
    updateCallbackDone: Promise.resolve(), finished: Promise.resolve(),
  })
  const transition = createThemeTransition()
  let committed = false
  transition.run(() => { committed = true }, origin)
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(committed, true)
  assert.equal(classes.has('theme-revealing'), false)
  transition.cancel()
})

test('unmount cancellation prevents a delayed theme commit', t => {
  const { doc, classes } = environment(t)
  let callback
  doc.startViewTransition = update => {
    callback = update
    return { skipTransition() {}, ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: Promise.resolve() }
  }
  const transition = createThemeTransition()
  let committed = false
  transition.run(() => { committed = true }, origin)
  transition.cancel()
  callback()
  assert.equal(committed, false)
  assert.equal(classes.size, 0)
})

test('stored theme is applied at initialization before React renders', t => {
  const { values, classes, root } = environment(t)
  values.set(THEME_STORAGE_KEY, 'dark')
  assert.equal(initializeTheme(), 'dark')
  assert.equal(classes.has('dark'), true)
  assert.equal(root.dataset.theme, 'dark')
  assert.equal(root.style.colorScheme, 'dark')
  values.set(THEME_STORAGE_KEY, 'light')
  assert.equal(initializeTheme(), 'light')
  assert.equal(classes.has('dark'), false)
})

test('system preference remains the default when no theme is stored', t => {
  environment(t, { systemDark: true })
  assert.equal(initializeTheme(), 'dark')
})
