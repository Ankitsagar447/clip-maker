import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, timer } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { JobService } from '../../services/job.service';
import { ChannelService } from '../../services/channel.service';
import { Job, JobStatus, Clip } from '../../models/job.model';

@Component({
  selector: 'app-job-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './job-list.component.html',
  styleUrls: ['./job-list.component.css'],
})
export class JobListComponent implements OnInit, OnDestroy {
  private readonly jobService = inject(JobService);
  private readonly channelService = inject(ChannelService);

  jobs: Job[] = [];
  isLoading: boolean = true;
  errorMessage: string | null = null;
  copiedClipId: string | null = null;
  isPolling: boolean = false;

  uploadingClipIds: Set<string> = new Set<string>();
  uploadingJobIds: Set<string> = new Set<string>();
  uploadNotification: { type: 'success' | 'error'; message: string; youtubeUrl?: string } | null = null;

  private pollingSub: Subscription | null = null;

  ngOnInit(): void {
    this.refresh();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  /**
   * Check if a job is in an active/non-terminal state.
   */
  isActiveJob(job: Job): boolean {
    return job.status !== 'done' && job.status !== 'error';
  }

  /**
   * Calculate 1-indexed queue position for jobs currently in 'queued' state.
   */
  getQueuePosition(job: Job): number {
    const queued = this.jobs
      .filter((j) => j.status === 'queued')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const idx = queued.findIndex((j) => j.id === job.id);
    return idx >= 0 ? idx + 1 : 0;
  }

  /**
   * Check if a clip is published to YouTube.
   */
  isClipPublished(clip: Clip): boolean {
    return Boolean(clip.isPublished || clip.youtubeUrl);
  }

  /**
   * Check if all clips in a job are published to YouTube.
   */
  isJobAllPublished(job: Job): boolean {
    if (job.allPublished) return true;
    return Boolean(job.clips && job.clips.length > 0 && job.clips.every((c) => this.isClipPublished(c)));
  }

  /**
   * Count how many clips in this job are published.
   */
  getPublishedClipsCount(job: Job): number {
    return (job.clips || []).filter((c) => this.isClipPublished(c)).length;
  }

  /**
   * Get the single job currently executing in the pipeline (not waiting in queue).
   */
  getActiveProcessingJob(): Job | undefined {
    return this.jobs.find((j) => this.isActiveJob(j) && j.status !== 'queued');
  }

  /**
   * Refreshes the job list and restarts polling if there are active jobs.
   */
  refresh(): void {
    this.isLoading = this.jobs.length === 0;
    this.errorMessage = null;

    this.jobService.listJobs().subscribe({
      next: (jobs) => {
        this.jobs = jobs;
        this.isLoading = false;
        this.startPollingIfNeeded();
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = 'Unable to connect to backend server. Make sure the backend is running.';
      },
    });
  }

  /**
   * Starts a 2.5s polling loop if at least one job is still in progress.
   */
  private startPollingIfNeeded(): void {
    const hasActiveJobs = this.jobs.some((job) => this.isActiveJob(job));

    if (!hasActiveJobs) {
      this.stopPolling();
      return;
    }

    if (this.pollingSub && !this.pollingSub.closed) {
      // Polling is already active
      return;
    }

    this.isPolling = true;

    // Poll every 2500ms
    this.pollingSub = timer(2500, 2500)
      .pipe(
        switchMap(() =>
          this.jobService.listJobs().pipe(
            catchError((err) => {
              console.warn('Polling error:', err);
              return of(this.jobs); // Keep existing jobs on transient network error
            })
          )
        )
      )
      .subscribe((jobs) => {
        this.jobs = jobs;

        const stillActive = this.jobs.some((job) => this.isActiveJob(job));
        if (!stillActive) {
          this.stopPolling();
        }
      });
  }

  private stopPolling(): void {
    if (this.pollingSub) {
      this.pollingSub.unsubscribe();
      this.pollingSub = null;
    }
    this.isPolling = false;
  }

  getStatusLabel(status: JobStatus): string {
    switch (status) {
      case 'queued':
        return 'Queued';
      case 'downloading':
        return 'Downloading Video';
      case 'transcribing':
        return 'Transcribing (Whisper)';
      case 'analyzing':
        return 'Finding Viral Moments (Claude)';
      case 'clipping':
        return 'Rendering 9:16 Clips';
      case 'done':
        return 'Completed';
      case 'error':
        return 'Failed';
      default:
        return status;
    }
  }

  getStepIndex(status: JobStatus): number {
    switch (status) {
      case 'queued':
        return 0;
      case 'downloading':
        return 1;
      case 'transcribing':
        return 2;
      case 'analyzing':
        return 3;
      case 'clipping':
        return 4;
      case 'done':
        return 5;
      case 'error':
        return -1;
      default:
        return 0;
    }
  }

  formatDuration(seconds: number): string {
    if (!seconds && seconds !== 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m > 0) {
      return `${m}m ${s}s`;
    }
    return `${s}s`;
  }

  formatTimestamp(seconds: number): string {
    if (!seconds && seconds !== 0) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' · ' + date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  }

  getDownloadFileName(job: Job, clip: Clip, index: number): string {
    const cleanTitle = (clip.title || `clip_${index + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return `${cleanTitle || 'clip'}.mp4`;
  }

  async copyClipLink(clip: Clip): Promise<void> {
    try {
      const fullUrl = window.location.origin + clip.url;
      await navigator.clipboard.writeText(fullUrl);
      this.copiedClipId = clip.id;
      setTimeout(() => {
        if (this.copiedClipId === clip.id) {
          this.copiedClipId = null;
        }
      }, 2500);
    } catch {
      // Fallback
    }
  }

  isUploadingClip(clipId: string): boolean {
    return this.uploadingClipIds.has(clipId);
  }

  isUploadingJob(jobId: string): boolean {
    return this.uploadingJobIds.has(jobId);
  }

  uploadClipNow(job: Job, clip: Clip, privacyStatus: string = 'public'): void {
    if (this.uploadingClipIds.has(clip.id)) return;
    this.uploadingClipIds.add(clip.id);
    this.uploadNotification = null;

    this.channelService.uploadClipNow(job.id, clip.id, privacyStatus).subscribe({
      next: (res) => {
        this.uploadingClipIds.delete(clip.id);
        if (res.success && res.uploadResult) {
          // Update the local clip instance immediately
          clip.youtubeUrl = res.uploadResult.url;
          clip.youtubeVideoId = res.uploadResult.videoId;
          clip.uploadedAt = res.uploadResult.publishedAt;
          clip.isSimulated = res.uploadResult.isSimulated;
          clip.isPublished = true;
          clip.videoDeleted = true;
          if (res.clip?.shortsTitle) clip.shortsTitle = res.clip.shortsTitle;
          if (res.clip?.shortsDescription) clip.shortsDescription = res.clip.shortsDescription;

          if (job.clips && job.clips.every((c) => this.isClipPublished(c))) {
            job.allPublished = true;
          }

          this.uploadNotification = {
            type: 'success',
            message: `Published "${clip.shortsTitle || clip.title}" to connected channel! Local video removed to save storage.`,
            youtubeUrl: res.uploadResult.url,
          };
          setTimeout(() => {
            if (this.uploadNotification?.youtubeUrl === res.uploadResult.url) {
              this.uploadNotification = null;
            }
          }, 10000);
        }
      },
      error: (err) => {
        this.uploadingClipIds.delete(clip.id);
        this.uploadNotification = {
          type: 'error',
          message: err?.error?.error || 'Failed to upload clip to YouTube. Check channel connection.',
        };
        setTimeout(() => {
          this.uploadNotification = null;
        }, 7000);
      },
    });
  }

  uploadAllClips(job: Job, privacyStatus: string = 'public'): void {
    if (this.uploadingJobIds.has(job.id)) return;
    this.uploadingJobIds.add(job.id);
    this.uploadNotification = null;

    this.channelService.uploadAllJobClips(job.id, privacyStatus).subscribe({
      next: (res) => {
        this.uploadingJobIds.delete(job.id);
        if (res.success && res.results) {
          let uploadedCount = 0;
          for (const item of res.results) {
            if (item.success && item.clip) {
              uploadedCount++;
              const localClip = job.clips.find((c) => c.id === item.clip!.id);
              if (localClip) {
                localClip.isPublished = true;
                localClip.videoDeleted = true;
                if (item.uploadResult) {
                  localClip.youtubeUrl = item.uploadResult.url;
                  localClip.youtubeVideoId = item.uploadResult.videoId;
                  localClip.uploadedAt = item.uploadResult.publishedAt;
                  localClip.isSimulated = item.uploadResult.isSimulated;
                }
                if (item.clip?.shortsTitle) localClip.shortsTitle = item.clip.shortsTitle;
              }
            }
          }

          if (job.clips && job.clips.every((c) => this.isClipPublished(c))) {
            job.allPublished = true;
          }

          this.uploadNotification = {
            type: 'success',
            message: `Successfully published ${uploadedCount} clips directly to YouTube! Local storage freed.`,
          };
          setTimeout(() => {
            this.uploadNotification = null;
          }, 8000);
        }
      },
      error: (err) => {
        this.uploadingJobIds.delete(job.id);
        this.uploadNotification = {
          type: 'error',
          message: err?.error?.error || 'Failed to upload all clips. Please verify YouTube connection.',
        };
        setTimeout(() => {
          this.uploadNotification = null;
        }, 7000);
      },
    });
  }

  dismissNotification(): void {
    this.uploadNotification = null;
  }
}
