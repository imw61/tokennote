import { invoke } from '@tauri-apps/api/core'

export type ForceReminderPayload = {
  content: string
  mode: 'once' | 'always'
  type: 'info' | 'warning' | 'danger'
  updatedAt?: string | null
}

export function getForceReminderPayload() {
  return invoke<ForceReminderPayload | null>('get_force_reminder_payload')
}

export function hideForceReminderWindow() {
  return invoke('hide_force_reminder_window')
}

export function acknowledgeForceReminder() {
  return invoke('acknowledge_force_reminder')
}
