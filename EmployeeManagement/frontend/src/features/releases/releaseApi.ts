import api from '../../services/api'

export const releaseNoteCategories = ['ui', 'new_features', 'improvements', 'bug_fixes'] as const

export type ReleaseNoteCategory = (typeof releaseNoteCategories)[number]
export type ReleaseType = 'patch' | 'minor' | 'major'
export type ReleaseNotes = Record<ReleaseNoteCategory, string[]>

export type AppRelease = {
  id: number | null
  version: string
  codename: string | null
  release_type: ReleaseType
  title: string
  release_notes: ReleaseNotes
  released_at: string | null
  environment: string
  build_date: string | null
  status: string
  released_by?: { id: number; name: string } | null
  build_sha?: string | null
  build_number?: string | null
}

export type ReleaseHistoryResponse = {
  releases: {
    data: AppRelease[]
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
}

export type CreateReleaseInput = {
  release_type: ReleaseType
  title: string
  release_notes: ReleaseNotes
}

const normalizeNotes = (notes: Partial<ReleaseNotes> | null | undefined): ReleaseNotes => ({
  ui: Array.isArray(notes?.ui) ? notes.ui : [],
  new_features: Array.isArray(notes?.new_features) ? notes.new_features : [],
  improvements: Array.isArray(notes?.improvements) ? notes.improvements : [],
  bug_fixes: Array.isArray(notes?.bug_fixes) ? notes.bug_fixes : [],
})

export const normalizeRelease = (release: AppRelease): AppRelease => ({
  ...release,
  release_notes: normalizeNotes(release.release_notes),
})

export const formatReleaseName = (release: AppRelease) =>
  `v${release.version}${release.codename ? ` — ${release.codename}` : ''}`

export const releaseVersionTag = (release: AppRelease) => `v${release.version}`

export async function fetchCurrentRelease(): Promise<AppRelease> {
  const response = await api.get<{ release: AppRelease }>('/system/release/current')
  return normalizeRelease(response.data.release)
}

export async function fetchReleaseHistory(page = 1): Promise<ReleaseHistoryResponse['releases']> {
  const response = await api.get<ReleaseHistoryResponse>('/developer/releases', {
    params: { page, per_page: 15 },
  })
  return {
    ...response.data.releases,
    data: response.data.releases.data.map(normalizeRelease),
  }
}

export async function createRelease(input: CreateReleaseInput): Promise<AppRelease> {
  const response = await api.post<{ release: AppRelease }>('/developer/releases', input)
  return normalizeRelease(response.data.release)
}
