import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import ts from 'typescript'
import * as centerState from '../src/components/employee-room/notificationCenterState.ts'
import { notificationCategory, notificationDestination, notificationUnreadCount, formatBellCount } from '../src/components/employee-room/notificationCenterState.ts'

const notice = { approval_id: null, assigned_task_id: null, case_task_id: null, case_document_id: null, target_path: null }

test('Chat contributes one item to the bell, independent of the number of unread messages', () => {
  assert.equal(notificationUnreadCount(1, 5), 2)
  assert.equal(notificationUnreadCount(1, 0), 1)
  assert.equal(formatBellCount(notificationUnreadCount(99, 5)), '99+')
})

test('notification targets preserve the exact task, document and approval identities', () => {
  assert.deepEqual(notificationDestination({ ...notice, assigned_task_id: 8 }), { employeeTask: 8 })
  const task = { ...notice, target_path: '/quests/50', case_task_id: 4, case_document_id: 5 }
  assert.equal(notificationCategory(task), 'task')
  assert.deepEqual(notificationDestination(task), { path: '/quests/50', state: { workspaceTab: 'tasks', taskId: 4 } })
  assert.deepEqual(notificationDestination({ ...task, case_task_id: null }), { path: '/quests/50', state: { workspaceTab: 'collection', collectionItemId: 5 } })
  const approval = { ...notice, approval_id: 7 }
  assert.equal(notificationCategory(approval), 'approval')
  assert.deepEqual(notificationDestination(approval), { path: '/approvals?approval=7' })
  assert.equal(notificationDestination({ ...notice, target_path: '//untrusted.invalid' }).path, undefined)
})

test('opening the panel never marks reads; item and bulk actions persist via their scoped endpoints', async () => {
  const state = [], calls = []
  let cursor = 0, currentNotice = { ...notice, id: 5, case_task_id: 4, target_path: '/quests/50', read_at: null }
  const fakeReact = {
    useState(value) {
      const i = cursor++
      if (!(i in state)) state[i] = value
      return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next }]
    },
    useRef(value) { const i = cursor++; return state[i] ??= { current: value } },
    useEffect() {},
    useCallback(fn) { return fn },
  }
  const api = {
    async get(path, options) {
      calls.push(['GET', path, options.params.details])
      return { data: { unread_count: Number(currentNotice.read_at === null), notifications: [currentNotice] } }
    },
    async patch(path) {
      calls.push(['PATCH', path])
      currentNotice = { ...currentNotice, read_at: '2026-11-04T00:00:00Z' }
      return { data: { notification: currentNotice } }
    },
  }
  const require = createRequire(import.meta.url)
  const source = readFileSync(new URL('../src/components/employee-room/NotificationCenter.tsx', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  compileFunction(code, ['require', 'module', 'exports', 'document'])(specifier => {
    if (specifier === 'react') return fakeReact
    if (specifier === 'react-dom') return { createPortal: element => element }
    if (specifier === 'react-router-dom') return {
      useLocation: () => ({ key: 'case', pathname: '/quests' }),
      useNavigate: () => (path, options) => calls.push(['NAVIGATE', path, options.state]),
    }
    if (specifier.endsWith('/AuthContext')) return { useAuth: () => ({ user: { id: 7, permission_names: [] } }) }
    if (specifier.endsWith('/useInternalChat')) return { useInternalChat: () => ({ unreadCount: 5, setDrawerOpen: open => calls.push(['CHAT', open]) }) }
    if (specifier.endsWith('/api')) return { __esModule: true, default: api }
    if (specifier === './NotificationPopover') return { __esModule: true, default: 'NotificationPopover' }
    if (specifier === './notificationCenterState') return centerState
    return require(specifier)
  }, module, module.exports, { body: {} })
  const session = module.exports.default({ children: null })
  const render = () => { cursor = 0; return session.type(session.props).props }
  const open = () => render().value.toggle({})
  const panel = () => render().children[1].props
  const flush = () => new Promise(resolve => setImmediate(resolve))
  open(); await flush()
  assert.deepEqual(calls, [['GET', '/notifications/center', 1]])
  assert.equal(render().value.unread, 2)
  panel().onNotice(currentNotice); await flush()
  assert.deepEqual(calls.filter(([verb]) => verb !== 'GET'), [
    ['PATCH', '/notifications/5/read'], ['NAVIGATE', '/quests/50', { workspaceTab: 'tasks', taskId: 4 }],
  ])
  assert.equal(render().value.anchor, null)
  assert.equal(render().value.unread, 1)
  open(); await flush()
  panel().onMarkAll(); await flush()
  assert.deepEqual(calls.filter(([verb]) => verb === 'PATCH').at(-1), ['PATCH', '/notifications/read-all'])
  assert.equal(render().value.unread, 1)
  panel().onChat()
  assert.deepEqual(calls.at(-1), ['CHAT', true])
})
