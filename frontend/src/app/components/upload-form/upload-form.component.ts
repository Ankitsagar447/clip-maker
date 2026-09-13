import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JobService } from '../../services/job.service';
import { Job } from '../../models/job.model';

@Component({
  selector: 'app-upload-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './upload-form.component.html',
  styleUrls: ['./upload-form.component.css'],
})
export class UploadFormComponent {
  private readonly jobService = inject(JobService);

  @Output() jobCreated = new EventEmitter<Job>();

  videoUrl: string = '';
  isSubmitting: boolean = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  /**
   * Validate that the input is non-empty and starts with http:// or https://
   */
  isValidUrl(url: string): boolean {
    if (!url || !url.trim()) return false;
    const parts = url.trim().split(/[\n,]+/).map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length === 0) return false;
    return parts.every((p) => {
      try {
        const parsed = new URL(p);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    });
  }

  async pasteFromClipboard(): Promise<void> {
    try {
      if (navigator?.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          this.videoUrl = text.trim();
          this.errorMessage = null;
        }
      }
    } catch {
      // Clipboard access might be blocked in some browsers/contexts; ignore
    }
  }

  clearInput(): void {
    this.videoUrl = '';
    this.errorMessage = null;
  }

  onSubmit(): void {
    const trimmed = this.videoUrl.trim();
    this.errorMessage = null;
    this.successMessage = null;

    if (!trimmed) {
      this.errorMessage = 'Please enter a video URL to generate clips.';
      return;
    }

    if (!this.isValidUrl(trimmed)) {
      this.errorMessage = 'Please enter valid web URL(s) (e.g., https://www.youtube.com/watch?v=...)';
      return;
    }

    this.isSubmitting = true;

    this.jobService.createJob(trimmed).subscribe({
      next: (job) => {
        this.isSubmitting = false;
        this.videoUrl = '';
        const count = trimmed.split(/[\n,]+/).filter((p) => p.trim().length > 0).length;
        this.successMessage =
          count > 1
            ? `${count} video links added to queue! Processing 1 at a time.`
            : 'Video added to queue! Processing sequentially.';
        this.jobCreated.emit(job);

        // Auto-dismiss success notification after 4s
        setTimeout(() => {
          this.successMessage = null;
        }, 5000);
      },
      error: (err) => {
        this.isSubmitting = false;
        const msg =
          err?.error?.error ||
          err?.message ||
          'Failed to submit video URL. Please verify the backend server is running.';
        this.errorMessage = msg;
      },
    });
  }
}
