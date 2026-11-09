import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { requiredWorkflowPresentation, requiredWorkflowStatuses } from '../src/features/document-collection/requiredWorkflowPresentation.ts'

test('required workflow presentation is one mapping of the supplied backend code', () => {
  for (const [key, value] of Object.entries(requiredWorkflowStatuses)) assert.deepEqual(requiredWorkflowPresentation(key), { key, label: value.label })
  assert.equal(requiredWorkflowStatuses.completed.indicator, 'check')
  assert.equal(requiredWorkflowStatuses.pending_review.indicator, 'dot')
})

const css = readFileSync(new URL('../src/features/document-collection/components/requiredWorkflowBadge.css', import.meta.url), 'utf8')
function badgeTokens(status, dark) {
  const tokens = {}
  for (const [, selector, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selector.includes('.dc-required-workflow-badge') || selector.includes('>')) continue
    if (selector.includes('.dark') && !dark) continue
    const states = [...selector.matchAll(/\[data-status=([a-z_]+)\]/g)].map(match => match[1])
    if (states.length && !states.includes(status)) continue
    for (const [, key, value] of declarations.matchAll(/(--required-badge-[a-z]+):\s*([^;]+);/g)) tokens[key] = value.trim()
  }
  return tokens
}
function rgb(hex) { return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16)) }
function luminance(color) { return color.map(value => { const channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4 }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0) }

test('badge text meets 4.5:1 contrast on light/dark required-document surfaces', () => {
  for (const dark of [false, true]) for (const status of Object.keys(requiredWorkflowStatuses)) {
    const tokens = badgeTokens(status, dark)
    const tint = tokens['--required-badge-rgb'].split(',').map(Number)
    const opacity = Number(tokens['--required-badge-fill'])
    const foreground = rgb(tokens['--required-badge-text'])
    for (const surface of dark ? ['#11161f', '#161c26'] : ['#ffffff', '#f8fafc']) {
      const background = rgb(surface).map((value, index) => value * (1 - opacity) + tint[index] * opacity)
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
      const contrast = (values[0] + .05) / (values[1] + .05)
      assert.ok(contrast >= 4.5, `${dark ? 'dark' : 'light'} ${status} on ${surface}: ${contrast.toFixed(2)}`)
    }
  }
  assert.match(css, /min-height:\s*25px/)
  assert.match(css, /padding:\s*4px 9px/)
  assert.match(css, /font-weight:\s*650/)
})
