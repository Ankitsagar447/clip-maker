import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UploadFormComponent } from './components/upload-form/upload-form.component';
import { JobListComponent } from './components/job-list/job-list.component';
import { ChannelAutopilotComponent } from './components/channel-autopilot/channel-autopilot.component';
import { YoutubeSchedulerComponent } from './components/youtube-scheduler/youtube-scheduler.component';
import { JobService } from './services/job.service';
import { Job } from './models/job.model';

export type AppTab = 'studio' | 'autopilot' | 'scheduler';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    UploadFormComponent,
    JobListComponent,
    ChannelAutopilotComponent,
    YoutubeSchedulerComponent,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  private readonly jobService = inject(JobService);

  @ViewChild('jobList') jobList!: JobListComponent;
  @ViewChild('youtubeScheduler') youtubeScheduler!: YoutubeSchedulerComponent;

  activeTab: AppTab = 'studio';
  llmStatus: any = null;

  ngOnInit(): void {
    this.jobService.getLlmStatus().subscribe({
      next: (status) => (this.llmStatus = status),
      error: () => {},
    });
  }

  setTab(tab: AppTab): void {
    this.activeTab = tab;
  }

  onJobCreated(newJob: Job): void {
    if (this.jobList) {
      this.jobList.refresh();
    }
  }

  onNewAutoJob(newJob: Job): void {
    if (this.jobList) {
      this.jobList.refresh();
    }
  }
}
