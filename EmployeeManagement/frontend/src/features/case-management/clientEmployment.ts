import type { ClientEmploymentDraft } from './types'

export function newEmploymentDraft(isCurrent = true): ClientEmploymentDraft {
  return {
    key: globalThis.crypto?.randomUUID?.() ?? `employment-${Date.now()}-${Math.random()}`,
    company_name: '', company_address: '', company_phone: '',
    employment_status: isCurrent ? 'employed' : 'former',
    start_date: '', end_date: '', is_current: isCurrent, notes: '',
  }
}

export function employmentPayload(item: ClientEmploymentDraft) {
  return {
    company_name: item.company_name.trim(),
    company_address: item.company_address.trim(),
    company_phone: item.company_phone?.trim() || null,
    employment_status: item.is_current && item.employment_status === 'former' ? 'employed' : !item.is_current && item.employment_status === 'employed' ? 'former' : item.employment_status,
    start_date: item.start_date || null,
    end_date: item.is_current ? null : item.end_date || null,
    is_current: item.is_current,
    notes: item.notes?.trim() || null,
  }
}
