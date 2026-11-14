import type { InternalChatMessage } from './types'

const storagePrefix = 'themis.chat.notifications'
const lastAlertByUser = new Map<number, number>()
let audio: AudioContext | undefined
let workerRegistration: Promise<ServiceWorkerRegistration> | undefined

const baseUrl = import.meta.env?.BASE_URL ?? '/'

export function chatNotificationEnabled(userId: number, setting: 'sound' | 'system') {
  const stored = localStorage.getItem(`${storagePrefix}.${userId}.${setting}`)
  return setting === 'sound' ? stored !== 'off' : stored === 'on'
}

export function setChatNotificationEnabled(userId: number, setting: 'sound' | 'system', enabled: boolean) {
  localStorage.setItem(`${storagePrefix}.${userId}.${setting}`, enabled ? 'on' : 'off')
}

export function canShowChatSystemNotifications() {
  return window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator
}

function registerWorker() {
  workerRegistration ??= navigator.serviceWorker.register(`${baseUrl}chat-notifications-sw.js`)
    .catch(error => {
      workerRegistration = undefined
      throw error
    })
  return workerRegistration
}

export async function enableChatSystemNotifications() {
  if (!canShowChatSystemNotifications()) return false
  if (await Notification.requestPermission() !== 'granted') return false
  await registerWorker()
  return true
}

export function listenForChatAudioGesture() {
  const unlock = () => {
    if (!window.AudioContext) return
    audio ??= new AudioContext()
    if (audio.state !== 'running') void audio.resume().catch(() => undefined)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  return () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    void audio?.close().catch(() => undefined)
    audio = undefined
  }
}

function playAlert(mention: boolean) {
  if (!audio || audio.state !== 'running') return
  const start = audio.currentTime
  for (const [index, frequency] of (mention ? [660, 880] : [520]).entries()) {
    const at = start + index * 0.12
    const note = audio.createOscillator()
    const volume = audio.createGain()
    note.frequency.value = frequency
    volume.gain.setValueAtTime(0.001, at)
    volume.gain.exponentialRampToValueAtTime(0.12, at + 0.02)
    volume.gain.exponentialRampToValueAtTime(0.001, at + 0.15)
    note.connect(volume).connect(audio.destination)
    note.start(at)
    note.stop(at + 0.16)
  }
}

export function chatAlertFor(messages: InternalChatMessage[], userId: number, afterId: number) {
  const incoming = messages.filter(message => message.id > afterId && !message.is_mine && !message.recalled_at)
  const newest = incoming.at(-1)
  if (!newest) return null
  const mention = incoming.findLast(message => message.mentions?.some(tag => tag.type === 'user' && tag.user_id === userId))
  return { latestId: newest.id, targetId: mention?.id ?? newest.id, mention: Boolean(mention) }
}

export async function notifyIncomingChat(userId: number, messages: InternalChatMessage[], chatOpen: boolean, signal: AbortSignal) {
  if (!messages.length || signal.aborted) return
  try {
    const key = `${storagePrefix}.${userId}.last-alert`
    const regularSound = chatNotificationEnabled(userId, 'sound')
    const foreground = document.visibilityState === 'visible' && document.hasFocus()
    const systemAllowed = (!foreground || !chatOpen) && chatNotificationEnabled(userId, 'system')
      && canShowChatSystemNotifications() && Notification.permission === 'granted'
    const claim = () => {
      if (signal.aborted) return null
      const afterId = Math.max(lastAlertByUser.get(userId) ?? 0, Number(localStorage.getItem(key)) || 0)
      const alert = chatAlertFor(messages, userId, afterId)
      if (!alert || (!systemAllowed && (audio?.state !== 'running' || (!regularSound && !alert.mention)))) return null
      lastAlertByUser.set(userId, alert.latestId)
      localStorage.setItem(key, String(alert.latestId))
      return alert
    }
    const alert = navigator.locks ? await navigator.locks.request(key, claim) : claim()
    if (!alert || signal.aborted) return

    const sound = alert.mention || regularSound
    if (systemAllowed) {
      try {
        const registered = await registerWorker()
        const worker = registered.active ? registered : await navigator.serviceWorker.ready
        if (signal.aborted) return
        const options = {
          body: alert.mention ? 'あなた宛てのメンションがあります。' : '新しいメッセージがあります。',
          icon: `${baseUrl}images/logoTHEMIS.png`,
          tag: `themis-chat-${userId}`,
          silent: !sound || (foreground && audio?.state === 'running'),
          renotify: sound,
          data: { messageId: alert.targetId },
        }
        await worker.showNotification('THEMIS HQ · 社内チャット', options)
        if (sound && foreground && !signal.aborted) playAlert(alert.mention)
        return
      } catch {
        // Keep in-page sound available if the browser cannot show a system alert.
      }
    }
    if (sound && !signal.aborted) playAlert(alert.mention)
  } catch {
    // Notification and storage failures must never interrupt chat synchronization.
  }
}
