export type JobStatus =
  | 'queued'
  | 'downloading'
  | 'transcribing'
  | 'analyzing'
  | 'clipping'
  | 'done'
  | 'error';

export interface Clip {
  id: string;
  title: string;
  hook: string;
  start: number;
  end: number;
  durationSeconds: number;
  url: string; // relative path served by the backend, e.g. /output/<jobId>/clip_1.mp4
  srtUrl?: string;
  vttUrl?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  uploadedAt?: string;
  shortsTitle?: string;
  shortsDescription?: string;
  isSimulated?: boolean;
  isPublished?: boolean;
  videoDeleted?: boolean;
}

export interface Job {
  id: string;
  youtubeUrl: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  clips: Clip[];
  allPublished?: boolean;
  queuePosition?: number;
  createdAt: string;
  updatedAt: string;
}
