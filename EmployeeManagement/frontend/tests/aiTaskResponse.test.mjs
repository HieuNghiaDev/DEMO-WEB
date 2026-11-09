import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ts from 'typescript'

const external = createRequire(import.meta.url)
let response = { message: '通常の回答', tool_executions: [] }
let posted
const api = { post: async (url, body) => { posted = { url, body }; return { data: { data: response } } } }
const cache = new Map()
let taskView = null
let floatingView = null
const authenticatedUser = { id: 7, name: 'Account name', employee: { full_name: '実際の社員' }, permission_names: ['ai.use'] }
function load(path) {
  if (cache.has(path)) return cache.get(path).exports
  const module = { exports: {} }; cache.set(path, module)
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const requireModule = specifier => {
    if (path.endsWith('ThemisAiAssistant.tsx')) {
      if (specifier === 'react') return { ...React, useState: initial => floatingView
        ? [floatingView.states[floatingView.index++], () => {}]
        : React.useState(initial) }
      if (specifier === 'react-router-dom') return { useLocation: () => ({ pathname: '/quests/49' }), useNavigate: () => () => {} }
      if (specifier.endsWith('contexts/AuthContext')) return { useAuth: () => ({ user: authenticatedUser }) }
      if (specifier === './useMascotFeedback') return { useMascotFeedback: () => ({ feedback: 'none', showFeedback: () => {} }) }
      if (specifier === './ThemisAIMascot' || specifier === './ThemisAIFloatingButton') return { __esModule: true, default: () => null }
      if (specifier === '../loading') return { InlineLoader: ({ label }) => React.createElement('span', null, label), ButtonSpinner: () => null }
    }
    if (specifier === 'react' && path.endsWith('TaskResultList.tsx')) return { ...external('react'),
      useState: initial => taskView ? [taskView.state ??= initial, update => { taskView.state = typeof update === 'function' ? update(taskView.state) : update }] : React.useState(initial),
      useMemo: (calculate, dependencies) => taskView ? calculate() : React.useMemo(calculate, dependencies),
    }
    if (specifier.endsWith('.css')) return {}
    if (specifier === 'react-markdown') return { __esModule: true, default: Markdown }
    if (specifier === 'remark-gfm') return { __esModule: true, default: remarkGfm }
    if (specifier.endsWith('services/api')) return { __esModule: true, default: api }
    if (!specifier.startsWith('.')) return external(specifier)
    const base = resolve(dirname(path), specifier)
    const file = extname(base) ? base : [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(existsSync)
    return load(file)
  }
  compileFunction(compiled, ['exports', 'require', 'module'], { filename: path })(module.exports, requireModule, module)
  return module.exports
}
const { aiTaskResults, aiTaskNextAction, aiTaskLocation, aiTaskContinuation, aiTaskIntroduction, aiTaskFilterRows, aiTaskFilterOptions } = load(resolve('src/features/ai/taskResults.ts'))
const { sendAiChatMessage } = load(resolve('src/features/ai/aiChat.ts'))
const { parseAiNavigation, aiNavigationLocation, aiDocumentForCase } = load(resolve('src/features/ai/navigationResults.ts'))
const Content = load(resolve('src/components/ai/AssistantMessageContent.tsx')).default
const TaskResultList = load(resolve('src/components/ai/TaskResultList.tsx')).default
const FloatingAssistant = load(resolve('src/components/ai/ThemisAiAssistant.tsx')).default
const flags = { can_accept: false, can_submit: false, can_reassign: false, can_change_deadline: false, can_approve: false, can_reject: false, can_cancel: false }
const row = (extra = {}) => ({ task_id: 4, case_id: 49, title: '委任状の取得', required_document_name: '委任状（民事）', required_document_code: 'C-002', status: 'pending_review', due_date: '2026-10-22', overdue: false, deadline_approaching: false, assignee: 'LE HIEU NGHIA', allowed_actions: flags, ...extra })
const execution = (tasks = [row()], extra = {}) => ({ name: 'query_case_tasks', tool_use_id: 'actual-tool', status: 'success', output: { scope: 'my', tasks, total_count: tasks.length, query: { scope: 'my' }, ...extra } })
const html = (tasks = [row()], extra = {}) => renderToStaticMarkup(React.createElement(Content, { content: '担当タスクを確認しました。', taskResults: aiTaskResults([execution(tasks, extra)]), onOpenTask: () => {}, onUsePrompt: () => {} }))

test('one authorized task renders a compact card with real identity, Japanese status, deadline and guidance', () => {
  const markup = html()
  for (const text of ['C-002 · T-4', '委任状（民事）', '確認待ち', '2026/10/22', '管理者の確認をお待ちください', 'タスクを開く']) assert.ok(markup.includes(text), text)
  assert.doesNotMatch(markup, /<table|>pending_review<|\*\*/)
  assert.equal((markup.match(/<article/g) ?? []).length, 1)
})
test('all workflow statuses reuse centralized Japanese labels and respect actual action flags', () => {
  const expected = { unaccepted: '未受領', in_progress: '対応中', pending_review: '確認待ち', changes_requested: '差戻し', completed: '完了', cancelled: 'キャンセル' }
  for (const [status, label] of Object.entries(expected)) assert.ok(html([row({ status })]).includes(label))
  assert.match(aiTaskNextAction(row({ status: 'unaccepted', allowed_actions: { ...flags, can_accept: true } })), /受領してください/)
  assert.doesNotMatch(aiTaskNextAction(row({ status: 'unaccepted' })), /してください/)
  assert.match(aiTaskNextAction(row({ status: 'changes_requested', allowed_actions: { ...flags, can_submit: true } })), /再提出してください/)
  assert.match(aiTaskNextAction(row({ status: 'pending_review', allowed_actions: { ...flags, can_approve: true } })), /タスク画面で審査/)
})
test('deadlines never use browser date arithmetic and missing deadlines stay explicit', () => {
  assert.match(html([row({ due_date: null })]), /未設定/)
  assert.match(html([row({ overdue: true })]), /class="themis-ai-task-overdue"/)
  assert.doesNotMatch(html([row({ due_date: '1999-01-01', status: 'completed', overdue: false })]), /class="themis-ai-task-overdue"/)
  assert.match(html([row({ deadline_approaching: true })]), /期限が近づいています/)
  assert.doesNotMatch(readFileSync('src/features/ai/taskResults.ts', 'utf8'), /new Date|Date\.parse/)
})
test('multiple/long tasks wrap in single-column cards and actual summary counts only', () => {
  const tasks = Array.from({ length: 7 }, (_, i) => row({ task_id: i + 1, required_document_name: '非常に長い日本語の資料名'.repeat(15), overdue: true }))
  const markup = html(tasks)
  assert.equal((markup.match(/<article/g) ?? []).length, 5)
  assert.match(markup, /7件のタスク/)
  assert.match(markup.replace(/<[^>]*>/g, ''), /確認待ち 7/)
  assert.match(markup, /未表示の期限超過タスク：2件/)
  assert.match(markup, /残りのタスクを表示/)
  const css = readFileSync('src/components/ai/assistantMessageContent.css', 'utf8')
  assert.match(css, /width: 100%; min-width: 0/)
  assert.match(css, /overflow-wrap: anywhere/)
  assert.match(css, /var\(--tm-surface-elevated\)/)
})
test('successful empty output differs from permission failure and retrieval failure', () => {
  assert.match(html([]), /現在、担当タスクはありません/)
  for (const status of ['failed', 'success']) {
    const results = aiTaskResults([{ name: 'query_case_tasks', status, output: null, error_message: 'SECRET exception' }])
    assert.equal(results[0].error, 'タスク情報を取得できませんでした。')
    assert.equal(results[0].tasks.length, 0)
  }
  const result = aiTaskResults([{ name: 'query_case_tasks', status: 'failed', error_message: '他の社員のタスクを閲覧する権限がありません。' }])[0]
  const markup = renderToStaticMarkup(React.createElement(Content, { content: '', taskResults: [result], onOpenTask: () => {}, onUsePrompt: () => {} }))
  assert.match(markup, /role="alert"/)
  assert.match(markup, /再試行する/)
  assert.doesNotMatch(markup, /担当タスクはありません|<article/)
})
test('model prose, other tool outputs and invalid identifiers cannot create task cards', () => {
  assert.deepEqual(aiTaskResults('T-4 | SECRET | 49'), [])
  assert.deepEqual(aiTaskResults([{ ...execution(), name: 'another_tool' }]), [])
  for (const invalid of [row({ task_id: '../admin' }), row({ case_id: -1 }), row({ status: 'invented' })]) assert.ok(aiTaskResults([execution([invalid])])[0].error)
})
test('pagination is explicit and continuation keeps actual scoped filters through the same tool pipeline', () => {
  const result = aiTaskResults([execution([row()], { total_count: 140, has_more: true, next_offset: 100, query: { scope: 'case', case_id: 49, status: 'pending_review', employee_id: 7 }, scope: 'case' })])[0]
  assert.equal(result.total, 140)
  assert.deepEqual(JSON.parse(aiTaskContinuation(result).split('条件: ')[1]), { scope: 'case', case_id: 49, employee_id: 7, status: 'pending_review', offset: 100 })
  assert.match(html([row()], { total_count: 140, has_more: true, next_offset: 100 }), /全140件/)
})
test('navigation uses actual case/task IDs and existing task-tab state, not model links', () => {
  assert.deepEqual(aiTaskLocation(row()), { pathname: '/quests/49', state: { workspaceTab: 'tasks', taskId: 4 } })
  const route = readFileSync('src/pages/BusinessQuest.tsx', 'utf8')
  assert.match(route, /initialTaskId=\{routeState\?\.taskId\}/)
  assert.match(route, /routeState\?\.taskId \? location.key/)
})
test('case finder uses a server-selected exact version, ignores URLs, and validates case and action IDs', async () => {
  const selected = { action: 'open_case_document', case_id: 50, document_id: 20, document_version_id: 83, source: 'received', version: 2, label: '委任状 · v2' }
  const { label: _label, ...selection } = selected
  response = { message: '対象を開きます。', navigation: { status: 'open', options: [{ ...selected, url: 'https://untrusted.test' }] } }
  const reply = await sendAiChatMessage({ persona: 'secretary', skill: 'task_management', message: '委任状を開いて', messages: [] })
  assert.deepEqual(aiNavigationLocation(reply.navigation.options[0]), { pathname: '/quests/50', search: '?document=20', state: { workspaceTab: 'documents', aiDocument: selection } })
  assert.deepEqual(aiDocumentForCase(selection, 50), selection)
  assert.equal(aiDocumentForCase(selected, 51), undefined)
  for (const invalid of [{ ...selected, action: 'open_url' }, { ...selected, case_id: '//other.test' }, { ...selected, document_version_id: 0 }]) {
    assert.equal(parseAiNavigation({ status: 'open', options: [invalid] }), undefined)
  }
  assert.equal(parseAiNavigation({ status: 'open', options: [selected, selected] }), undefined)
  response = { message: '通常の回答', tool_executions: [] }
})
test('ambiguous finder options are escaped text and navigate only when chosen', () => {
  const selected = { action: 'open_case', case_id: 50, label: '<img src=x> CASE-00050' }
  const navigation = parseAiNavigation({ status: 'choose', options: [selected, { ...selected, case_id: 51, label: 'CASE-00051' }] })
  const opened = []
  const props = { content: '候補を選んでください。', navigation, onNavigate: item => opened.push(aiNavigationLocation(item)) }
  const markup = renderToStaticMarkup(React.createElement(Content, props))
  assert.match(markup, /&lt;img src=x&gt;/)
  assert.doesNotMatch(markup, /<img|<a /)
  assert.equal(opened.length, 0)
  const cards = Content.type(props).props.children[1]
  cards[1].props.children.props.children[2].props.onClick()
  assert.deepEqual(opened, [{ pathname: '/quests/51', state: null }])
})
test('a single document result links to the selected document drawer on click', () => {
  const selected = { action: 'open_case_document', case_id: 50, document_id: 4, document_version_id: 7, source: 'received', version: 2, label: 'CASE-00050 · C-002 · 委任状 · v2' }
  const navigation = parseAiNavigation({ status: 'open', options: [{
    ...selected, client_name: 'Phạm Gia Huy', case_code: 'CASE-00050', title: '委任状', details: 'C-002 · v2',
  }] })
  const opened = []
  const props = { content: 'Đã tìm thấy kết quả.', navigation, onNavigate: item => opened.push(aiNavigationLocation(item)) }
  const markup = renderToStaticMarkup(React.createElement(Content, props))
  assert.match(markup, /Mở tài liệu/)
  assert.match(markup, /Tài liệu · CASE-00050/)
  assert.match(markup, /<h4>Phạm Gia Huy<\/h4><p class="themis-ai-navigation-title">委任状<\/p>/)
  assert.match(markup, /C-002 · v2<\/p>/)
  assert.equal(opened.length, 0)
  Content.type(props).props.children[1][0].props.children.props.children[2].props.onClick()
  const { label, ...target } = selected
  assert.deepEqual(opened, [{ pathname: '/quests/50', search: '?document=4', state: { workspaceTab: 'documents', aiDocument: target } }])
})
test('normal AI replies safely render Markdown paragraphs, emphasis, lists, code, links and non-task tables', () => {
  const markup = renderToStaticMarkup(React.createElement(Content, { content: '**太字** と *強調*\n\n- 項目\n- `code`\n\n[安全なリンク](https://example.test)\n\n| 資料 | 説明 |\n| --- | --- |\n| PDF | 確認 |', onOpenTask: () => {}, onUsePrompt: () => {} }))
  for (const text of ['<strong>太字</strong>', '<em>強調</em>', '<ul>', '<code>code</code>', '<table>', 'rel="noopener noreferrer"']) assert.ok(markup.includes(text), text)
})
test('HTML scripts, remote images, javascript/data links and event handlers cannot execute', () => {
  const markup = renderToStaticMarkup(React.createElement(Content, { content: '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert%281%29)\n\n[data](data:text/html,SECRET)\n\n![tracker](https://example.test/track)', onOpenTask: () => {}, onUsePrompt: () => {} }))
  assert.doesNotMatch(markup, /<script|<img|onerror|href="javascript|href="data/)
})
test('API retains structured output, suppresses fabricated task prose and sends history as text only', async () => {
  response = { message: '**Fake count 99**\n|Task|SECRET|', tool_executions: [execution()] }
  const reply = await sendAiChatMessage({ persona: 'secretary', skill: 'task_management', message: '今日のタスクは？', messages: [{ role: 'assistant', content: 'prior', taskResults: [{ tasks: ['SECRET'] }] }] })
  assert.equal(reply.content, '本日の担当タスクを確認しました。')
  assert.equal(reply.taskResults[0].tasks[0].task_id, 4)
  assert.equal(reply.taskResults[0].today, true)
  assert.deepEqual(posted.body.messages, [{ role: 'assistant', content: 'prior' }])
  assert.equal(posted.url, '/ai/chat')
  response = { message: '**通常回答**' }
  assert.equal((await sendAiChatMessage({ persona: 'secretary', skill: 'task_management', message: '説明して', messages: [] })).content, '**通常回答**')
})
test('Japanese is default while explicit English/Vietnamese questions retain conversational language', () => {
  assert.match(aiTaskIntroduction('今日のタスクは？'), /担当タスク/)
  assert.match(aiTaskIntroduction('show my tasks'), /authorized/)
  assert.match(aiTaskIntroduction('xem task của tôi'), /phạm vi/)
})
test('loading remains a compact existing indicator; both clients clear private cards on account/permission changes', () => {
  for (const path of ['src/components/ai/ThemisAiAssistant.tsx', 'src/pages/AI.tsx']) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /user\?\.id.*user\?\.permission_names\.join/)
    assert.match(source, /\.\.\.assistantMessage/)
  }
  assert.match(readFileSync('src/components/ai/ThemisAiAssistant.tsx', 'utf8'), /InlineLoader ai label="AIが考えています/)
})

test('approved summary has functional status chips using only loaded authorized results', () => {
  const tasks = [row({ task_id: 1, status: 'unaccepted' }), row({ task_id: 2, status: 'in_progress', overdue: true }), row({ task_id: 3, status: 'pending_review' }), row({ task_id: 4, status: 'completed' }), row({ task_id: 5, status: 'changes_requested' })]
  const options = aiTaskFilterOptions(tasks)
  assert.equal(options.find(option => option.value === 'all').count, 5)
  assert.equal(options.find(option => option.value === 'overdue').count, 1)
  assert.ok(options.some(option => option.value === 'completed'))
  assert.deepEqual(aiTaskFilterRows(tasks, 'pending_review').map(task => task.task_id), [3])
  assert.deepEqual(aiTaskFilterRows(tasks, 'overdue').map(task => task.task_id), [2])
  assert.deepEqual(aiTaskFilterRows(tasks, 'all'), tasks)
  const props = { result: aiTaskResults([execution(tasks)])[0], onOpenTask: () => {}, onUsePrompt: () => {} }
  const find = (element, predicate) => {
    if (!element || typeof element !== 'object') return null
    if (predicate(element)) return element
    for (const child of React.Children.toArray(element.props?.children)) {
      const found = find(child, predicate)
      if (found) return found
    }
    return null
  }
  taskView = {}
  try {
    const tree = TaskResultList(props)
    find(tree, element => element.props?.['data-filter'] === 'pending_review').props.onClick()
    const filtered = TaskResultList(props)
    const markup = renderToStaticMarkup(filtered)
    assert.equal((markup.match(/<article/g) ?? []).length, 1)
    assert.match(markup, /T-3/)
    assert.doesNotMatch(markup, /T-1|T-2|T-4|T-5/)
    assert.match(markup, /data-filter="pending_review" aria-pressed="true"/)
    assert.match(markup, /未表示の期限超過タスク：1件/)
    find(filtered, element => element.props?.['data-filter'] === 'all').props.onClick()
    assert.equal((renderToStaticMarkup(TaskResultList(props)).match(/<article/g) ?? []).length, 5)
  } finally { taskView = null }
})

test('personalized greeting renders bold without exposing literal Markdown or inventing a name', async () => {
  response = { message: '**wrong model name**', tool_executions: [execution()] }
  const reply = await sendAiChatMessage({ persona: 'secretary', skill: 'task_management', message: '今日のタスクは？', messages: [], employeeName: '実際の社員' })
  const markup = renderToStaticMarkup(React.createElement(Content, { ...reply, onOpenTask: () => {}, onUsePrompt: () => {} }))
  assert.match(markup, /<strong>実際の社員 さん<\/strong>/)
  assert.doesNotMatch(markup, /\*\*|wrong model name/)
  assert.doesNotMatch(aiTaskIntroduction('今日のタスクは？'), /LE HIEU NGHIA/)
  assert.match(aiTaskIntroduction('今日のタスクは？', '**name**'), /\\\*/)
})

test('summary date uses the real tool timestamp in Tokyo and scope-specific headings', () => {
  const markup = html([row()], { generated_at: '2026-10-07T16:05:00Z', scope: 'case' })
  assert.match(markup, /2026年10月8日/)
  assert.match(markup, /この案件のタスク/)
  assert.doesNotMatch(markup, /本日の担当タスク|2026年10月7日/)
  assert.doesNotMatch(html([row()], { generated_at: 'invalid' }), /Invalid Date/)
})

test('navigation guidance is optional and only the first successful response receives it', () => {
  const props = { content: '', taskResults: aiTaskResults([execution()]), onOpenTask: () => {}, onUsePrompt: () => {} }
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(Content, props)), /補足/)
  assert.match(renderToStaticMarkup(React.createElement(Content, { ...props, showTaskGuidance: true })), /補足/)
  const source = readFileSync('src/components/ai/ThemisAiAssistant.tsx', 'utf8')
  assert.match(source, /showTaskGuidance=\{index === firstTaskResponseIndex\}/)
})

test('mockup dimensions adapt to desktop/mobile; cards and chips wrap without a nested scroller', () => {
  const panelCss = readFileSync('src/components/ai/ThemisAiAssistant.css', 'utf8')
  const cardCss = readFileSync('src/components/ai/assistantMessageContent.css', 'utf8')
  assert.match(panelCss, /width: min\(580px, calc\(100vw - 48px\)\)/)
  assert.match(panelCss, /height: min\(900px, calc\(100dvh - 48px\)\)/)
  for (const viewport of [768, 1024, 1280, 1366, 1440]) {
    assert.equal(Math.min(580, viewport - 48), 580)
  }
  assert.equal(Math.min(580, 640 - 48), 580)
  assert.match(panelCss, /height: min\(94dvh, 800px\)/)
  assert.match(panelCss, /max-height: calc\(100dvh - 24px\)/)
  assert.match(panelCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(cardCss, /themis-ai-task-filters \{ display: flex; flex-wrap: wrap/)
  assert.match(cardCss, /themis-ai-task-card-actions \{ display: flex; flex-wrap: wrap/)
  assert.match(cardCss, /prefers-reduced-motion/)
  assert.doesNotMatch(cardCss, /themis-ai-task-card[^}]+overflow-y/)
  const source = readFileSync('src/components/ai/ThemisAiAssistant.tsx', 'utf8')
  assert.doesNotMatch(source, /sm:w-\[402px\]/)
  assert.match(source, /!followMessagesRef.current/)
  assert.match(source, /scrollHeight - body.scrollTop - body.clientHeight/)
  assert.match(source, /min-h-0 min-w-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto/)
  assert.doesNotMatch(source, /sm:inset-y-6|sm:h-auto|hasTaskResults.*themis-ai-panel/)
  assert.match(panelCss, /themis-ai-statusbar,\s*\.themis-ai-composer-area \{\s*flex-shrink: 0/)
  assert.match(panelCss, /themis-ai-online-identity \{[^}]*flex-wrap: nowrap/)
  assert.match(panelCss, /max-width: min\(440px, calc\(100% - 46px\)\)/)
  assert.doesNotMatch(panelCss, /\.dark[^{}]*\{[^}]*(?:width|height):/)
})

test('the floating shell stays identical across empty, welcome, chat, tasks, loading and error states', () => {
  const persona = { id: 1, name: 'secretary', skills: ['task_management'] }
  const message = (content, extra = {}) => ({ role: 'assistant', content, createdAt: '10:00', ...extra })
  const states = [
    { label: 'welcome', expected: '今日は何をお手伝いしましょうか？' },
    { label: 'empty', messages: [] },
    { label: 'normal chat', messages: [message('質問', { role: 'user' }), message('通常の回答')] },
    { label: 'task results', messages: [message('担当タスクを確認しました。', { taskResults: aiTaskResults([execution()]) })], expected: 'C-002 · T-4' },
    { label: 'preparing persona', loading: true, expected: 'AI秘書を準備しています…' },
    { label: 'persona error', loadError: '読み込み失敗', expected: '再読み込み' },
    { label: 'no persona', personas: [], expected: '有効なAI秘書はまだ登録されていません。' },
    { label: 'paused persona', personas: [{ ...persona, skills: [] }] },
    { label: 'waiting for reply', sending: true, expected: 'AIが考えています…' },
    { label: 'send error', chatError: '送信失敗', expected: '送信失敗' },
    { label: 'long content', messages: [message('technical_string_'.repeat(300))] },
  ]
  let shellClass
  try {
    for (const state of states) {
      floatingView = { index: 0, states: [true, true, state.personas ?? [persona], 1, {},
        state.messages ? { secretary: state.messages } : {}, '', state.loading ?? false, true,
        state.sending ?? false, state.loadError ?? null, state.chatError ?? null, '10:00'] }
      const markup = renderToStaticMarkup(React.createElement(FloatingAssistant))
      const panelClass = markup.match(/class="(themis-ai-panel [^"]+)"/)[1]
      shellClass ??= panelClass
      assert.equal(panelClass, shellClass, state.label)
      for (const part of ['themis-ai-panel-header', 'themis-ai-statusbar', 'themis-ai-chat-scroll', 'themis-ai-quick-actions', 'themis-ai-composer-area', 'AI社員を開く']) assert.ok(markup.includes(part), `${state.label}: ${part}`)
      assert.equal((markup.match(/class="themis-ai-quick-action /g) ?? []).length, 4, state.label)
      assert.equal((markup.match(/<textarea/g) ?? []).length, 1, state.label)
      assert.ok(markup.indexOf('themis-ai-statusbar') < markup.indexOf('themis-ai-chat-scroll'))
      assert.ok(markup.indexOf('themis-ai-chat-scroll') < markup.indexOf('themis-ai-composer-area'))
      if (state.expected) assert.ok(markup.includes(state.expected), state.label)
      if (state.label === 'welcome') {
        assert.match(markup, /実際の社員さん。/)
        assert.match(markup, /THEMIS AIです。/)
        assert.match(markup, /必要資料の整理などをサポートできます。/)
        assert.doesNotMatch(markup, /Account name|<article/)
      }
      if (state.loading || state.loadError || state.personas) assert.match(markup, /<textarea[^>]*disabled/)
      if (state.chatError) assert.ok(markup.indexOf(state.chatError) < markup.indexOf('themis-ai-composer-area'))
    }
  } finally { floatingView = null }
})
