import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ChannelService } from '../../services/channel.service';
import { UploadQueueItem, YouTubeStatus } from '../../models/channel.model';

@Component({
  selector: 'app-youtube-scheduler',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './youtube-scheduler.component.html',
  styleUrls: ['./youtube-scheduler.component.css'],
})
export class YoutubeSchedulerComponent implements OnInit, OnDestroy {
  private readonly channelService = inject(ChannelService);

  youtubeStatus: YouTubeStatus = {
    hasCredentialsConfigured: false,
    isConnected: false,
    channel: null,
  };

  queueItems: UploadQueueItem[] = [];
  isLoadingStatus: boolean = false;
  isLoadingQueue: boolean = false;
  actionInProgressId: string | null = null;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  private pollSub: Subscription | null = null;

  ngOnInit(): void {
    this.loadStatus();
    this.loadQueue();
    this.startPolling();
  }

  ngOnDestroy(): void {
    if (this.pollSub) {
      this.pollSub.unsubscribe();
    }
  }

  loadStatus(): void {
    this.isLoadingStatus = true;
    this.channelService.getYouTubeStatus().subscribe({
      next: (status) => {
        this.youtubeStatus = status;
        this.isLoadingStatus = false;
      },
      error: () => {
        this.isLoadingStatus = false;
      },
    });
  }

  loadQueue(): void {
    this.isLoadingQueue = this.queueItems.length === 0;
    this.channelService.listUploadQueue().subscribe({
      next: (items) => {
        this.queueItems = items;
        this.isLoadingQueue = false;
      },
      error: () => {
        this.isLoadingQueue = false;
      },
    });
  }

  startPolling(): void {
    // Poll queue status every 6 seconds
    this.pollSub = timer(6000, 6000)
      .pipe(switchMap(() => this.channelService.listUploadQueue()))
      .subscribe({
        next: (items) => {
          this.queueItems = items;
        },
      });
  }

  connectYouTube(): void {
    this.errorMessage = null;
    this.channelService.getYouTubeAuthUrl().subscribe({
      next: (res) => {
        if (res.url) {
          window.location.href = res.url;
        }
      },
      error: (err) => {
        this.errorMessage =
          err?.error?.error ||
          'To connect YouTube, set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in backend/.env';
      },
    });
  }

  disconnectYouTube(): void {
    if (confirm('Disconnect YouTube account? Scheduled uploads will pause.')) {
      this.channelService.disconnectYouTube().subscribe({
        next: () => {
          this.loadStatus();
          this.successMessage = 'YouTube channel disconnected.';
          setTimeout(() => (this.successMessage = null), 4000);
        },
      });
    }
  }

  uploadNow(item: UploadQueueItem): void {
    this.actionInProgressId = item.id;
    this.errorMessage = null;

    this.channelService.uploadNow(item.id).subscribe({
      next: (updated) => {
        this.actionInProgressId = null;
        this.successMessage = `Upload complete! Published as: "${updated.title}"`;
        this.loadQueue();
        setTimeout(() => (this.successMessage = null), 5000);
      },
      error: (err) => {
        this.actionInProgressId = null;
        this.errorMessage = err?.error?.error || 'Failed to upload video to YouTube.';
        this.loadQueue();
      },
    });
  }

  cancelUpload(item: UploadQueueItem): void {
    if (confirm(`Remove "${item.title}" from upload schedule?`)) {
      this.channelService.deleteQueueItem(item.id).subscribe({
        next: () => {
          this.loadQueue();
        },
      });
    }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return (
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
        ' · ' +
        d.toLocaleDateString([], { month: 'short', day: 'numeric' })
      );
    } catch {
      return dateStr;
    }
  }

  getTimeRemaining(dateStr: string): string {
    try {
      const target = new Date(dateStr).getTime();
      const diffMs = target - Date.now();
      if (diffMs <= 0) return 'Due now';
      const diffMins = Math.round(diffMs / 60000);
      if (diffMins < 60) return `in ${diffMins}m`;
      const diffHours = Math.floor(diffMins / 60);
      const remainingMins = diffMins % 60;
      return `in ${diffHours}h ${remainingMins}m`;
    } catch {
      return '';
    }
  }

  get pendingItems(): UploadQueueItem[] {
    return this.queueItems.filter(
      (item) => item.status === 'scheduled' || item.status === 'uploading'
    );
  }

  get completedItems(): UploadQueueItem[] {
    return this.queueItems.filter(
      (item) => item.status === 'uploaded' || item.status === 'failed'
    );
  }
}
