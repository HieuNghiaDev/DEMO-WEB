import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import { resolve } from 'node:path'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

function emailDialogHarness(options = {}) {
  const slots = [], effects = [], calls = []
  let cursor = 0, tree, changed = 0
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next }]
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useEffect(effect, deps) {
      const index = cursor++
      if (!same(slots[index]?.deps, deps)) {
        const previous = slots[index]
        slots[index] = { deps }
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect() })
      }
    },
  }
  class Input { constructor(value) { this.value = value } }
  class Form {
    constructor(values) {
      this.values = new Map(Object.entries(values).map(([key, value]) => [key, new Input(value)]))
      this.elements = { namedItem: name => this.values.get(name) }
    }
  }
  class FormData {
    constructor(form) { this.values = new Map([...form.values].map(([key, input]) => [key, input.value])) }
    get(name) { return this.values.get(name) }
  }
  const api = {
    get: async () => ({ data: { available: options.available ?? true, requires_mfa: options.mfa ?? false, delivery: 'local_log' } }),
    post: async (url, body) => {
      calls.push({ url, body })
      if (options.post) return options.post(url, body)
      return { data: url.endsWith('/confirm') ? { reauthentication_required: true }
        : { challenge_id: '00000000-0000-4000-8000-000000000001', expires_in: options.mfa ? 300 : 600, resend_after: 0 } }
    },
  }
  const path = resolve('src/components/settings/EmailChangeDialog.tsx')
  const external = createRequire(path)
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  compileFunction(code, ['require', 'module', 'exports', 'FormData', 'HTMLInputElement', 'window'])(
    name => {
      if (name === 'react') return react
      if (name === '../../services/api') return { __esModule: true, default: api }
      if (name === '../ui') return {
        ModalShell: props => React.createElement('section', { role: 'dialog', 'aria-label': props.title }, props.children),
        Button: ({ children, loading, variant: _variant, size: _size, ...props }) => React.createElement('button', { ...props, disabled: props.disabled || loading }, children),
      }
      return external(name)
    }, module, module.exports, FormData, Input, { setInterval: () => 1, clearInterval() {} },
  )
  const find = (node, predicate) => {
    if (!React.isValidElement(node)) return undefined
    if (predicate(node)) return node
    return React.Children.toArray(node.props.children).map(child => find(child, predicate)).find(Boolean)
  }
  const flush = async () => {
    for (let index = 0; index < 8; index++) {
      cursor = 0
      tree = module.exports.default({ onClose() {}, onChanged() { changed++ } })
      while (effects.length) effects.shift()()
      await Promise.resolve()
    }
  }
  const submit = values => {
    const form = new Form(values)
    find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: form })
    return form
  }
  return { flush, submit, calls, get changed() { return changed }, html: () => renderToStaticMarkup(tree),
    enterEmail(value) { find(tree, node => node.props.id === 'email-change-address').props.onChange({ target: { value } }) },
    click(label) { find(tree, node => typeof node.type === 'function' && node.props.children === label).props.onClick() },
    input: id => find(tree, node => node.props.id === id),
  }
}

test('email change requests a six-digit challenge before any confirmation and clears secrets from the form', async () => {
  const run = emailDialogHarness()
  await run.flush()
  assert.match(run.html(), /email-verification\.log/)
  run.enterEmail('new@example.test')
  await run.flush()
  const form = run.submit({ current_password: 'synthetic-password' })
  await run.flush()
  assert.equal(run.calls.length, 1)
  assert.equal(run.calls[0].url, '/me/email-change')
  assert.equal(run.calls[0].body.email, 'new@example.test')
  assert.equal(form.elements.namedItem('current_password').value, '')
  assert.equal(run.changed, 0)
  assert.equal(run.input('email-change-code').props.pattern, '[0-9]{6}')
  assert.match(run.html(), /有効期限は10分/)
  run.submit({ code: '012345' })
  await run.flush()
  assert.deepEqual(run.calls[1].body, { challenge_id: '00000000-0000-4000-8000-000000000001', code: '012345' })
  assert.equal(run.changed, 1)
})

test('invalid or expired code stays in the code form and can request another code', async () => {
  const run = emailDialogHarness({ post: async url => {
    if (url.endsWith('/confirm')) throw { isAxiosError: true, response: { status: 422, data: { errors: { code: ['synthetic'] } } } }
    return { data: { challenge_id: '00000000-0000-4000-8000-000000000001', expires_in: 600, resend_after: 0 } }
  } })
  await run.flush()
  run.enterEmail('new@example.test')
  await run.flush()
  run.submit({ current_password: 'synthetic' })
  await run.flush()
  run.submit({ code: '000000' })
  await run.flush()
  assert.equal(run.changed, 0)
  assert.match(run.html(), /role="alert"[^]*有効期限が切れています/)
  run.click('コードを再送信')
  await run.flush()
  assert.equal(run.input('email-change-address').props.value, 'new@example.test')
  assert.ok(run.input('email-change-password'))
})

test('in-flight sends cannot be duplicated and unavailable delivery cannot submit', async () => {
  let complete
  const run = emailDialogHarness({ post: () => new Promise(resolve => { complete = resolve }) })
  await run.flush()
  run.enterEmail('new@example.test')
  await run.flush()
  run.submit({ current_password: 'synthetic' })
  run.submit({ current_password: 'synthetic' })
  assert.equal(run.calls.length, 1)
  complete({ data: { challenge_id: '00000000-0000-4000-8000-000000000001', expires_in: 600, resend_after: 0 } })
  await run.flush()
  const unavailable = emailDialogHarness({ available: false })
  await unavailable.flush()
  unavailable.submit({ current_password: 'synthetic' })
  assert.equal(unavailable.calls.length, 0)
})

test('MFA accounts must provide the separate authenticator field alongside the email challenge flow', async () => {
  const run = emailDialogHarness({ mfa: true })
  await run.flush()
  assert.equal(run.input('email-change-mfa').props.required, true)
  run.enterEmail('new@example.test')
  await run.flush()
  run.submit({ current_password: 'synthetic', otp: '123456' })
  await run.flush()
  assert.equal(run.calls[0].body.otp, '123456')
  assert.match(run.html(), /有効期限は5分/)
  assert.equal(run.changed, 0)
})
