export type VisaDeadlineLevel =
  | 'overdue'
  | 'critical'
  | 'warning'
  | 'normal'
  | 'none'

export type VisaDeadline = {
  label: string
  date: string
}

export type VisaProgressApplication = {
  id: string
  case_id: string | null
  applicant_name: string | null
  case_type: string | null
  status: string | null
  responsible_person: string | null
  application_date: string | null
  deadline: string | null
  deadlines: VisaDeadline[]
  days_remaining: number | null
  deadline_level: VisaDeadlineLevel
  source_sheet: string
  source_row: number
}

export type VisaProgressSource = {
  name: string
  modified_at: string | null
  synced_at: string
  sheet_name: string
}

export type VisaProgressSummary = {
  total: number
  in_review: number
  additional_documents: number
  approved: number
  attention_required: number
}

export type VisaProgressDashboard = {
  source: VisaProgressSource
  summary: VisaProgressSummary
  applications: VisaProgressApplication[]
}
