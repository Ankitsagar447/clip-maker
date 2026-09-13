import { Component, OnInit, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChannelService } from '../../services/channel.service';
import { MonitoredChannel } from '../../models/channel.model';
import { Job } from '../../models/job.model';

@Component({
  selector: 'app-channel-autopilot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './channel-autopilot.component.html',
  styleUrls: ['./channel-autopilot.component.css'],
})
export class ChannelAutopilotComponent implements OnInit {
  private readonly channelService = inject(ChannelService);

  @Output() newJobTriggered = new EventEmitter<Job>();

  channels: MonitoredChannel[] = [];
  isLoading: boolean = false;
  isAddingChannel: boolean = false;
  checkingChannelId: string | null = null;
  processingBacklogId: string | null = null;
  manualLinkChannelId: string | null = null;
  manualVideoUrl: string = '';
  isSubmittingManualLink: boolean = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  // New channel form inputs
  channelUrl: string = '';
  dailyUploadFrequency: number = 4; // 1 to 20
  privacyStatus: 'private' | 'unlisted' | 'public' = 'private';
  autoUpload: boolean = true;
  backlogMode: boolean = true;

  ngOnInit(): void {
    this.loadChannels();
  }

  loadChannels(): void {
    this.isLoading = true;
    this.channelService.listChannels().subscribe({
      next: (channels) => {
        this.channels = channels;
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = 'Failed to load monitored channels from backend.';
      },
    });
  }

  getFrequencyIntervalDescription(freq: number): string {
    const f = Math.min(20, Math.max(1, Number(freq) || 1));
    const hours = 24 / f;
    if (hours >= 1) {
      const rounded = Math.round(hours * 10) / 10;
      return `1 clip uploaded every ${rounded} hour${rounded === 1 ? '' : 's'}`;
    }
    const mins = Math.round(hours * 60);
    return `1 clip uploaded every ${mins} minutes`;
  }

  onAddChannel(): void {
    const trimmed = this.channelUrl.trim();
    if (!trimmed) {
      this.errorMessage = 'Please enter a YouTube channel URL or @handle.';
      return;
    }

    this.isAddingChannel = true;
    this.errorMessage = null;
    this.successMessage = null;

    this.channelService
      .addChannel({
        url: trimmed,
        dailyUploadFrequency: this.dailyUploadFrequency,
        privacyStatus: this.privacyStatus,
        autoUpload: this.autoUpload,
        backlogMode: this.backlogMode,
        clipsPerVideo: 4,
      })
      .subscribe({
        next: (created) => {
          this.isAddingChannel = false;
          this.channelUrl = '';
          this.successMessage = `Channel "${created.name}" is now monitored on Auto-Pilot (${this.dailyUploadFrequency} clips/day).`;
          this.loadChannels();
          setTimeout(() => (this.successMessage = null), 5000);
        },
        error: (err) => {
          this.isAddingChannel = false;
          this.errorMessage =
            err?.error?.error || err?.message || 'Failed to inspect or add channel.';
        },
      });
  }

  toggleBacklogMode(channel: MonitoredChannel): void {
    const newSetting = channel.backlogMode === false ? true : false;
    this.channelService.updateChannel(channel.id, { backlogMode: newSetting }).subscribe({
      next: (updated) => {
        channel.backlogMode = updated.backlogMode;
        this.successMessage = `Backlog Mode ${newSetting ? 'ENABLED' : 'DISABLED'} for ${channel.name}.`;
        setTimeout(() => (this.successMessage = null), 3000);
      },
      error: (err) => {
        this.errorMessage = 'Failed to update channel settings.';
      },
    });
  }

  checkChannelNow(channel: MonitoredChannel): void {
    this.checkingChannelId = channel.id;
    this.errorMessage = null;
    this.successMessage = null;

    this.channelService.checkChannelNow(channel.id).subscribe({
      next: (res) => {
        this.checkingChannelId = null;
        if (res.newVideosCount > 0) {
          const modeLabel = res.isBacklog ? 'past backlog video' : 'new video';
          this.successMessage = `Found ${modeLabel} for ${channel.name}! Generated 4 clips and queued uploads.`;
          res.triggeredJobs.forEach((job) => this.newJobTriggered.emit(job));
        } else {
          this.successMessage = `Channel "${channel.name}" checked. No unclipped videos found.`;
        }
        this.loadChannels();
        setTimeout(() => (this.successMessage = null), 5000);
      },
      error: (err) => {
        this.checkingChannelId = null;
        this.errorMessage = err?.error?.error || err?.message || 'Failed to check channel for new videos.';
      },
    });
  }

  processBacklogNow(channel: MonitoredChannel): void {
    this.processingBacklogId = channel.id;
    this.errorMessage = null;
    this.successMessage = null;

    this.channelService.processBacklog(channel.id).subscribe({
      next: (res) => {
        this.processingBacklogId = null;
        if (res.newVideosCount > 0) {
          this.successMessage = `Selected older video from ${channel.name}! Started pipeline for 4 vertical clips & auto-uploads.`;
          res.triggeredJobs.forEach((job) => this.newJobTriggered.emit(job));
        } else {
          this.successMessage = `All older videos in ${channel.name}'s recent catalog have already been clipped!`;
        }
        this.loadChannels();
        setTimeout(() => (this.successMessage = null), 6000);
      },
      error: (err) => {
        this.processingBacklogId = null;
        this.errorMessage = err?.error?.error || err?.message || 'Failed to process older video.';
      },
    });
  }

  toggleManualLinkInput(channelId: string): void {
    if (this.manualLinkChannelId === channelId) {
      this.manualLinkChannelId = null;
      this.manualVideoUrl = '';
    } else {
      this.manualLinkChannelId = channelId;
      this.manualVideoUrl = '';
    }
  }

  submitManualClip(channel: MonitoredChannel): void {
    const url = this.manualVideoUrl.trim();
    if (!url) {
      this.errorMessage = 'Please enter a valid YouTube video URL.';
      return;
    }

    this.isSubmittingManualLink = true;
    this.errorMessage = null;
    this.successMessage = null;

    this.channelService.clipChannelLink(channel.id, url).subscribe({
      next: (res) => {
        this.isSubmittingManualLink = false;
        this.manualLinkChannelId = null;
        this.manualVideoUrl = '';
        this.successMessage = `Started clipping "${res.videoTitle}" for ${channel.name}! 4 clips will be auto-uploaded.`;
        if (res.job) this.newJobTriggered.emit(res.job);
        this.loadChannels();
        setTimeout(() => (this.successMessage = null), 6000);
      },
      error: (err) => {
        this.isSubmittingManualLink = false;
        this.errorMessage = err?.error?.error || err?.message || 'Failed to clip manual video link.';
      },
    });
  }

  deleteChannel(channel: MonitoredChannel): void {
    if (confirm(`Stop monitoring channel "${channel.name}" on Auto-Pilot?`)) {
      this.channelService.deleteChannel(channel.id).subscribe({
        next: () => {
          this.loadChannels();
        },
        error: (err) => {
          this.errorMessage = 'Failed to remove channel.';
        },
      });
    }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return 'Never';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + d.toLocaleDateString();
    } catch {
      return dateStr;
    }
  }
}
