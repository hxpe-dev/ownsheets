export interface Sheet {
  id: string
  owner_id: string
  title: string
  composer: string | null
  arranger: string | null
  key: string | null
  difficulty: number | null
  page_count: number | null
  file_path: string
  notes: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

export interface Setlist {
  id: string
  owner_id: string
  name: string
  created_at: string
  updated_at: string
}
