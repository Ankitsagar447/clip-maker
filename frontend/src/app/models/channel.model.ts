export interface MonitoredChannel {
  id: string;
  name: string;
  handle: string;
  url: string;
  avatar: string;
  subscribers: number | null;
  dailyUploadFrequency: number; // 1 to 20 videos per day
  privacyStatus: 'private' | 'unlisted' | 'public';
  autoUpload: boolean;
  backlogMode?: boolean;
  clipsPerVideo?: number;
  processedVideoIds: string[];
  clippedHistory?: Array<{
    videoId: string;
    title: string;
    url: string;
    clippedAt: string;
    clipsCount: number;
    jobId: string;
    isBacklog?: boolean;
    isManual?: boolean;
  }>;
  lastChecked: string;
  createdAt: string;
  recentVideos?: Array<{
    id: string;
    title: string;
    url: string;
    duration: number;
    thumbnail: string;
  }>;
}

export interface UploadQueueItem {
  id: string;
  jobId: string;
  clipId: string;
  clipUrl: string;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: 'private' | 'unlisted' | 'public';
  scheduledTime: string;
  dailyFrequency: number;
  status: 'scheduled' | 'uploading' | 'uploaded' | 'failed';
  error: string | null;
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  channelName: string;
  isSimulated?: boolean;
  createdAt: string;
  uploadedAt?: string;
}

export interface YouTubeChannelProfile {
  id: string;
  title: string;
  customUrl?: string;
  avatar?: string;
  subscriberCount?: string;
  connectedAt: string;
}

export interface YouTubeStatus {
  hasCredentialsConfigured: boolean;
  isConnected: boolean;
  channel: YouTubeChannelProfile | null;
}
