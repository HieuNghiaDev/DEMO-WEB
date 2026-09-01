// Run through the Browser skill against the dev-only case-management.html transport harness.
import assert from 'node:assert/strict'

const button = (tab, name) => tab.playwright.getByRole('button', { name, exact: true })
const createButton = tab => tab.playwright.locator('.cm-heading').getByRole('button', { name: '新規案件', exact: true })
const select = (tab, name) => tab.playwright.getByRole('combobox', { name, exact: true })
const text = (tab, name) => tab.playwright.getByRole('textbox', { name, exact: false })
const log = async tab => JSON.parse(await tab.playwright.getByTestId('case-transport-log').textContent())
const route = async tab => tab.playwright.getByTestId('route').textContent()
const rows = tab => tab.playwright.locator('.cm-row')
const loadedList = async tab => tab.playwright.getByRole('button', { name: /試験依頼者 山田 CASE-000001/ }).waitFor({ state: 'visible' })

export async function listChecks(tab) {
  await tab.reload(); await loadedList(tab)
  assert.equal(await rows(tab).count(), 10)
  await button(tab, '次のページ').click(); assert.equal(await rows(tab).count(), 2)
  await tab.playwright.getByRole('searchbox', { name: '検索', exact: true }).fill('山田')
  await loadedList(tab); assert.equal(await rows(tab).count(), 6)
  await tab.playwright.getByRole('searchbox', { name: '検索', exact: true }).fill(' ')
  await select(tab, '案件状態').selectOption('waiting'); assert.equal(await rows(tab).count(), 6)
  await select(tab, '事件類型').selectOption('労災'); assert.equal(await rows(tab).count(), 0)
  await select(tab, '案件状態').selectOption('all'); await select(tab, '事件類型').selectOption('all')
  await loadedList(tab)
  await button(tab, '空の一覧').click(); await tab.playwright.getByText('案件はまだ登録されていません。', { exact: true }).waitFor({ state: 'visible' })
  await button(tab, '新規案件').last().click(); await tab.playwright.getByRole('dialog', { name: '新規案件', exact: true }).waitFor({ state: 'visible' })
  assert.equal(await route(tab), '/quests')
  await button(tab, 'キャンセル').click(); await button(tab, '一覧を復元').click(); await loadedList(tab)
  return ['list pagination/filtering', 'new case opens an in-place modal rather than a new route', 'empty-state creation entry point']
}

async function openNew(tab) {
  await tab.reload(); await loadedList(tab); await createButton(tab).click()
  await tab.playwright.getByRole('dialog', { name: '新規案件', exact: true }).waitFor({ state: 'visible' })
}
function noDocumentWrites(requests) {
  assert.equal(requests.some(request => /initialize|initialization-preview|apply-document-template|document-collection/.test(request.url)), false)
}
async function chooseExistingClient(tab, query = 'yamada@example.test') {
  await text(tab, '氏名 *').fill(query)
  await tab.playwright.locator('.cm-new-client-suggestions button').first().click()
}
async function selectType(tab, parent = '労災') {
  await tab.playwright.getByRole('button', { name: new RegExp(`^${parent}`) }).click()
}

export async function createChecks(tab) {
  await openNew(tab)
  assert.equal(await button(tab, '次へ').count(), 0); assert.equal(await button(tab, '戻る').count(), 0)
  assert.equal(await tab.playwright.locator('input[name=title]').count(), 0)
  for (const forbidden of ['案件状態', '優先度', '部署', '開始日', '目標完了日', '案件名', '案件番号', '依頼者備考', '案件の詳細設定', '詳細区分']) assert.equal(await tab.playwright.getByText(forbidden, { exact: true }).count(), 0)
  assert.equal(await tab.playwright.locator('.cm-simple-contact[open]').count(), 0)
  await button(tab, '入力内容を確認').click()
  assert.equal(await text(tab, '氏名 *').getAttribute('aria-invalid'), 'true')
  assert.ok((await tab.playwright.getByText('事件類型を選択してください。', { exact: true }).count()) > 0)
  assert.equal((await log(tab)).some(request => request.method === 'post'), false)
  await chooseExistingClient(tab)
  await selectType(tab)
  assert.equal(await tab.playwright.getByRole('button', { name: /^労災/ }).getAttribute('aria-pressed'), 'true')
  await text(tab, '案件メモ').fill('事故・相談の状況')
  await button(tab, '入力内容を確認').click()
  const review = tab.playwright.getByRole('dialog', { name: '登録内容の確認', exact: true })
  await review.waitFor({ state: 'visible' })
  assert.ok((await review.textContent()).includes('試験依頼者 山田'))
  assert.ok((await review.textContent()).includes('労災'))
  assert.equal((await log(tab)).some(request => request.method === 'post'), false)
  await button(tab, '修正する').click(); assert.equal(await review.count(), 0)
  await button(tab, '入力内容を確認').click(); await review.waitFor({ state: 'visible' })
  assert.ok((await review.textContent()).includes('事故・相談の状況'))
  await button(tab, '修正する').click()
  await text(tab, '案件メモ').fill('修正した内容')
  await button(tab, '入力内容を確認').click(); await review.waitFor({ state: 'visible' })
  assert.ok((await review.textContent()).includes('修正した内容'))
  await select(tab, '応答時間').selectOption('1500')
  await button(tab, 'この内容で案件を作成').click()
  assert.equal(await button(tab, '作成中…').isEnabled(), false)
  assert.equal(await button(tab, '修正する').isEnabled(), false)
  await button(tab, '案件を編集').waitFor({ state: 'visible' }); assert.equal(await route(tab), '/quests/99')
  const requests = await log(tab)
  const creates = requests.filter(request => request.url === '/case-files' && request.method === 'post')
  assert.equal(creates.length, 1)
  assert.equal(creates[0].payload.client_id, 1)
  assert.equal(creates[0].payload.title, '試験依頼者 山田 / 労災')
  assert.equal(creates[0].payload.summary, '修正した内容')
  for (const removed of ['status', 'priority', 'department_id', 'opened_at', 'target_completion_at']) assert.equal(removed in creates[0].payload, false)
  noDocumentWrites(requests)
  return ['invalid form remains inline and makes no POST', 'review displays draft with no API mutation', '修正する preserves draft', 'next review uses amended draft', 'final confirm submits exactly once', 'no checklist initialization']
}

export async function newClientRecoveryChecks(tab) {
  await openNew(tab)
  await text(tab, '氏名 *').fill('Le Hieu Nghia')
  await tab.playwright.locator('#new-case-name_kana').fill('レ・ヒエウ・ギア')
  await tab.playwright.getByText('依頼者情報を追加', { exact: true }).click()
  await text(tab, '電話番号').fill('090-1234-5678'); await text(tab, 'メールアドレス').fill('new@example.test')
  await text(tab, '住所').fill('東京都 テスト')
  await selectType(tab)
  await button(tab, '入力内容を確認').click()
  await tab.playwright.getByRole('dialog', { name: '登録内容の確認', exact: true }).waitFor({ state: 'visible' })
  assert.equal((await log(tab)).some(request => request.method === 'post'), false)
  await select(tab, '試験エラー').selectOption('case422afterclient')
  await button(tab, 'この内容で案件を作成').click()
  await tab.playwright.getByText('入力内容を確認してください。', { exact: true }).waitFor({ state: 'visible' })
  let requests = await log(tab)
  assert.equal(requests.filter(request => request.url === '/clients' && request.method === 'post').length, 1)
  assert.equal(requests.filter(request => request.url === '/case-files' && request.method === 'post').length, 1)
  assert.ok((await tab.playwright.locator('.cm-chosen-client').textContent()).includes('Le Hieu Nghia'))
  await select(tab, '試験エラー').selectOption('')
  await button(tab, '入力内容を確認').click(); await tab.playwright.getByRole('dialog', { name: '登録内容の確認', exact: true }).waitFor({ state: 'visible' })
  await button(tab, 'この内容で案件を作成').click(); await button(tab, '案件を編集').waitFor({ state: 'visible' })
  requests = await log(tab)
  assert.equal(requests.filter(request => request.url === '/clients' && request.method === 'post').length, 1)
  assert.equal(requests.filter(request => request.url === '/case-files' && request.method === 'post').length, 2)
  noDocumentWrites(requests)
  return ['new client has manual kana and inline details', 'client success/case failure keeps selected client', 'retry creates only the case']
}

export async function editChecks(tab) {
  await tab.reload(); await loadedList(tab)
  await tab.playwright.getByRole('button', { name: /試験依頼者 山田 CASE-000001/ }).click(); await button(tab, '案件を編集').click(); await button(tab, '保存').waitFor({ state: 'visible' })
  await tab.playwright.getByText('詳細設定', { exact: true }).click()
  assert.equal(await tab.playwright.locator('input[name=title]').count(), 1)
  await button(tab, 'キャンセル').click(); await button(tab, '案件を編集').waitFor({ state: 'visible' })
  return ['existing case edit remains available and independent from client creation']
}
