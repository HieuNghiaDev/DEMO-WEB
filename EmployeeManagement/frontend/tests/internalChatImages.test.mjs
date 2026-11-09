import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTypeScript } from './helpers/loadTypeScript.mjs'

function previewHarness(name, fetchAttachment) {
  const path = resolve('src/features/internal-chat', name)
  const require = createRequire(path)
  const effects = [], refs = [], states = [], created = [], revoked = [], observations = []
  let stateIndex = 0, refIndex = 0, tree
  const react = {
    useImperativeHandle() {},
    useId() { return 'synthetic-image-title' },
    useState(initial) {
      const index = stateIndex++
      if (!(index in states)) states[index] = initial
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
    },
    useRef(initial) { return refs[refIndex++] ??= { current: initial } },
    useEffect(effect) { effects.push(effect) },
  }
  class Observer {
    constructor(callback) { this.callback = callback; observations.push(this) }
    observe(node) { this.node = node }
    disconnect() { this.disconnected = true }
  }
  const url = {
    createObjectURL(file) { created.push(file); return `blob:synthetic-${created.length}` },
    revokeObjectURL(value) { revoked.push(value) },
  }
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  compileFunction(code, ['require', 'module', 'exports', 'URL', 'IntersectionObserver'])(
    name => {
      if (name === 'react') return react
      if (name === './api') return { fetchChatAttachment: fetchAttachment }
      if (name === './chatMentions') return loadTypeScript(resolve('src/features/internal-chat/chatMentions.ts'))
      if (name === './ChatImageViewer') return { __esModule: true, default: props => React.createElement('div', {
        'data-image-viewer': 'open', 'data-image-url': props.url,
      }) }
      if (name === '../../components/ui/ModalShell') return {
        __esModule: true, default: props => React.createElement('div', { 'data-modal-shell': props.isOpen }, props.children),
      }
      return require(name)
    },
    module, module.exports, url, Observer,
  )
  const render = props => {
    stateIndex = 0
    refIndex = 0
    effects.length = 0
    tree = module.exports.default(props)
    return renderToStaticMarkup(tree)
  }
  return { render, effects, refs, states, created, revoked, observations, get tree() { return tree } }
}

function findElement(node, predicate) {
  if (!React.isValidElement(node)) return undefined
  if (predicate(node)) return node
  return React.Children.toArray(node.props.children).map(child => findElement(child, predicate)).find(Boolean)
}

test('received image automatically loads near the viewport through authenticated transport and releases its URL', async () => {
  const requests = []
  const blob = new Blob(['synthetic PNG'], { type: 'image/png' })
  const run = previewHarness('ChatAttachment.tsx', async (...args) => { requests.push(args); return blob })
  const props = { messageId: 6, file: { id: 1, name: 'photo.png', mime_type: 'image/png', size: 1024 } }
  assert.match(run.render(props), /画像を読み込み中/)
  run.refs[0].current = {}
  const cleanups = run.effects.map(effect => effect())
  assert.equal(requests.length, 0)
  const observer = run.observations[0]
  observer.callback([{ isIntersecting: true }])
  observer.callback([{ isIntersecting: true }])
  await Promise.resolve()
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0].slice(0, 2), [6, 1])
  assert.equal(observer.disconnected, true)
  assert.match(run.render(props), /<img[^>]*src="blob:synthetic-1"[^>]*alt="photo.png"/)
  assert.match(run.render(props), /画像を大きく表示/)
  assert.doesNotMatch(run.render(props), /internal-chat-attachment-row|1024 KB|1 KB/)
  const open = findElement(run.tree, node => node.props['aria-label'] === '画像を大きく表示')
  open.props.onClick()
  assert.match(run.render(props), /data-image-viewer="open" data-image-url="blob:synthetic-1"/)
  assert.equal(requests.length, 1)
  assert.equal(run.created[0], blob)
  cleanups.forEach(cleanup => cleanup?.())
  assert.equal(requests[0][2].aborted, true)
  assert.deepEqual(run.revoked, ['blob:synthetic-1'])
})

test('late image responses cannot restore a closed chat or allocate a leaked URL', async () => {
  let finish
  const run = previewHarness('ChatAttachment.tsx', () => new Promise(resolve => { finish = resolve }))
  const props = { messageId: 6, file: { id: 1, name: 'photo.png', mime_type: 'image/png', size: 1024 } }
  run.render(props)
  run.refs[0].current = {}
  const cleanups = run.effects.map(effect => effect())
  run.observations[0].callback([{ isIntersecting: true }])
  cleanups.forEach(cleanup => cleanup?.())
  finish(new Blob(['synthetic']))
  await Promise.resolve()
  assert.equal(run.created.length, 0)
  assert.equal(run.states[1], null)
})

test('draft images preview locally before sending and are removed without uploading', () => {
  let selected
  const run = previewHarness('ChatComposer.tsx', () => { assert.fail('draft must not upload') })
  const file = new File(['synthetic image'], 'photo.png', { type: 'image/png' })
  const props = { draft: '', files: [file], onFiles: next => { selected = next }, isSending: false }
  const html = run.render(props)
  assert.match(html, /photo\.png の送信前プレビュー/)
  assert.match(html, /photo\.png を外す/)
  const image = run.refs.at(-1).current = {}
  const cleanups = run.effects.map(effect => effect())
  assert.equal(image.src, 'blob:synthetic-1')
  assert.equal(run.created[0], file)

  const draft = findElement(run.tree, node => node.props.file === file)
  draft.props.onRemove()
  assert.deepEqual(selected, [])
  cleanups.forEach(cleanup => cleanup?.())
  assert.deepEqual(run.revoked, ['blob:synthetic-1'])
})

test('image viewer fits the image, bounds zoom, supports dragging and reuses its download action', async () => {
  let downloaded = 0, closed = 0
  const run = previewHarness('ChatImageViewer.tsx')
  const props = { url: 'blob:synthetic-photo', name: 'private-photo.png', downloading: false,
    onDownload: async () => { downloaded++ }, onClose: () => { closed++ } }
  const html = run.render(props)
  assert.match(html, /data-modal-shell="true"/)
  assert.match(html, /role="dialog" aria-modal="true"/)
  assert.doesNotMatch(html, />private-photo\.png</)
  const button = label => findElement(run.tree, node => node.type === 'button' && node.props['aria-label'] === label)
  const node = { clientWidth: 600, clientHeight: 400, scrollLeft: 0, scrollTop: 0, scrollTo() {}, setPointerCapture() {} }
  run.refs[0].current = node
  findElement(run.tree, node => node.type === 'img').props.onLoad({ currentTarget: { naturalWidth: 1000, naturalHeight: 500 } })
  run.render(props)
  assert.deepEqual(findElement(run.tree, node => node.type === 'img').props.style, { width: 568, height: 284 })
  button('拡大').props.onClick()
  run.render(props)
  assert.match(run.render(props), /125%/)
  const viewport = findElement(run.tree, node => node.props.className === 'internal-chat-image-viewer-viewport')
  viewport.props.onPointerDown({ currentTarget: node, pointerType: 'mouse', button: 0, clientX: 80, clientY: 90, preventDefault() {} })
  viewport.props.onPointerMove({ currentTarget: node, clientX: 60, clientY: 70 })
  assert.equal(node.scrollLeft, 20)
  assert.equal(node.scrollTop, 20)
  viewport.props.onPointerUp()

  for (let i = 0; i < 30; i++) { button('拡大').props.onClick(); run.render(props) }
  assert.equal(button('拡大').props.disabled, true)
  assert.match(run.render(props), /400%/)
  for (let i = 0; i < 30; i++) { button('縮小').props.onClick(); run.render(props) }
  assert.equal(button('縮小').props.disabled, true)
  assert.match(run.render(props), /50%/)
  button('表示をリセット').props.onClick()
  assert.match(run.render(props), /100%/)
  await button('画像をダウンロード').props.onClick()
  button('画像プレビューを閉じる').props.onClick()
  assert.equal(downloaded, 1)
  assert.equal(closed, 1)
})

test('ordinary file attachments keep their filename, size and download control', () => {
  const run = previewHarness('ChatAttachment.tsx', () => assert.fail('document downloads require a click'))
  const html = run.render({ messageId: 6, file: { id: 1, name: 'document.pdf', mime_type: 'application/pdf', size: 1024 } })
  assert.match(html, /internal-chat-attachment-row/)
  assert.match(html, /internal-chat-file-icon/)
  assert.match(html, /internal-chat-file-name/)
  assert.match(html, />document\.pdf</)
  assert.match(html, /PDF · 1 KB/)
  assert.match(html, /document\.pdf をダウンロード/)
  assert.doesNotMatch(html, /internal-chat-image-frame|画像を大きく表示/)
  const cleanups = run.effects.map(effect => effect())
  assert.equal(run.observations.length, 0)
  cleanups.forEach(cleanup => cleanup?.())
})
