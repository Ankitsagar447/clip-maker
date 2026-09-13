import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  MonitoredChannel,
  UploadQueueItem,
  YouTubeStatus,
} from '../models/channel.model';
import { Job, Clip } from '../models/job.model';

@Injectable({
  providedIn: 'root',
})
export class ChannelService {
  private readonly http = inject(HttpClient);
  private readonly channelsUrl = '/api/channels';
  private readonly youtubeUrl = '/api/youtube';

  // --- Channel Monitoring ---

  listChannels(): Observable<MonitoredChannel[]> {
    return this.http.get<MonitoredChannel[]>(this.channelsUrl);
  }

  addChannel(data: {
    url: string;
    dailyUploadFrequency: number;
    privacyStatus: string;
    autoUpload: boolean;
    backlogMode?: boolean;
    clipsPerVideo?: number;
  }): Observable<MonitoredChannel> {
    return this.http.post<MonitoredChannel>(this.channelsUrl, data);
  }

  updateChannel(
    id: string,
    patch: Partial<MonitoredChannel>
  ): Observable<MonitoredChannel> {
    return this.http.patch<MonitoredChannel>(`${this.channelsUrl}/${id}`, patch);
  }

  deleteChannel(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.channelsUrl}/${id}`);
  }

  checkChannelNow(
    id: string
  ): Observable<{
    channel: MonitoredChannel;
    newVideosCount: number;
    isBacklog?: boolean;
    triggeredJobs: Job[];
  }> {
    return this.http.post<{
      channel: MonitoredChannel;
      newVideosCount: number;
      isBacklog?: boolean;
      triggeredJobs: Job[];
    }>(`${this.channelsUrl}/${id}/check`, {});
  }

  processBacklog(
    id: string
  ): Observable<{
    channel: MonitoredChannel;
    newVideosCount: number;
    isBacklog: boolean;
    triggeredJobs: Job[];
  }> {
    return this.http.post<{
      channel: MonitoredChannel;
      newVideosCount: number;
      isBacklog: boolean;
      triggeredJobs: Job[];
    }>(`${this.channelsUrl}/${id}/process-backlog`, {});
  }

  clipChannelLink(
    id: string,
    videoUrl: string
  ): Observable<{
    channel: MonitoredChannel;
    job: Job;
    videoTitle: string;
    targetUrl: string;
  }> {
    return this.http.post<{
      channel: MonitoredChannel;
      job: Job;
      videoTitle: string;
      targetUrl: string;
    }>(`${this.channelsUrl}/${id}/clip-link`, { videoUrl });
  }

  // --- YouTube & Upload Scheduler ---

  getYouTubeStatus(): Observable<YouTubeStatus> {
    return this.http.get<YouTubeStatus>(`${this.youtubeUrl}/status`);
  }

  getYouTubeAuthUrl(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${this.youtubeUrl}/auth-url`);
  }

  disconnectYouTube(): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.youtubeUrl}/disconnect`, {});
  }

  listUploadQueue(): Observable<UploadQueueItem[]> {
    return this.http.get<UploadQueueItem[]>(`${this.youtubeUrl}/queue`);
  }

  uploadNow(id: string): Observable<UploadQueueItem> {
    return this.http.post<UploadQueueItem>(`${this.youtubeUrl}/queue/${id}/upload-now`, {});
  }

  deleteQueueItem(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.youtubeUrl}/queue/${id}`);
  }

  scheduleJobClips(
    job: Job,
    options: {
      dailyUploadFrequency?: number;
      privacyStatus?: string;
      channelName?: string;
    } = {}
  ): Observable<UploadQueueItem[]> {
    return this.http.post<UploadQueueItem[]>(`${this.youtubeUrl}/schedule-job`, {
      job,
      ...options,
    });
  }

  uploadClipNow(
    jobId: string,
    clipId: string,
    privacyStatus = 'public'
  ): Observable<{
    success: boolean;
    clip: Clip;
    uploadResult: {
      isSimulated: boolean;
      videoId: string;
      url: string;
      publishedAt: string;
    };
    queueItem: UploadQueueItem;
  }> {
    return this.http.post<{
      success: boolean;
      clip: Clip;
      uploadResult: {
        isSimulated: boolean;
        videoId: string;
        url: string;
        publishedAt: string;
      };
      queueItem: UploadQueueItem;
    }>(`${this.youtubeUrl}/upload-clip-now`, {
      jobId,
      clipId,
      privacyStatus,
    });
  }

  uploadAllJobClips(
    jobId: string,
    privacyStatus = 'public'
  ): Observable<{
    success: boolean;
    results: Array<{
      success: boolean;
      clip?: Clip;
      uploadResult?: {
        isSimulated: boolean;
        videoId: string;
        url: string;
        publishedAt: string;
      };
      queueItem?: UploadQueueItem;
      error?: string;
    }>;
  }> {
    return this.http.post<{
      success: boolean;
      results: Array<{
        success: boolean;
        clip?: Clip;
        uploadResult?: {
          isSimulated: boolean;
          videoId: string;
          url: string;
          publishedAt: string;
        };
        queueItem?: UploadQueueItem;
        error?: string;
      }>;
    }>(`${this.youtubeUrl}/upload-all-job-clips`, {
      jobId,
      privacyStatus,
    });
  }
}
