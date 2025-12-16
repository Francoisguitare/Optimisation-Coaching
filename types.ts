export interface Student {
  id: string;
  name: string;
  createdAt: string;
}

export interface SessionResult {
  total: number; // in seconds (cumulative sum of passages)
  passages?: number[]; // Array of individual durations in seconds
}

export interface Session {
  id: string; // e.g., '2023-10-27' or '2023-10-27_169842123'
  date: string; // ISO timestamp
  results: Record<string, SessionResult>; // map studentId -> result
}

export type ViewType = 'live' | 'dashboard' | 'history' | 'students';

export type DashboardFilter = 'daily' | 'weekly' | 'monthly';