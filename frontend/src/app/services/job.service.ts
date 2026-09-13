import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Job } from '../models/job.model';

@Injectable({
  providedIn: 'root',
})
export class JobService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/jobs';

  /**
   * Create a new clipping job with a video URL (YouTube, Vimeo, Twitch, Kick).
   */
  createJob(youtubeUrl: string): Observable<Job> {
    return this.http.post<Job>(this.baseUrl, { youtubeUrl });
  }

  /**
   * List all clipping jobs (newest first).
   */
  listJobs(): Observable<Job[]> {
    return this.http.get<Job[]>(this.baseUrl);
  }

  /**
   * Fetch a single job by its ID.
   */
  getJob(id: string): Observable<Job> {
    return this.http.get<Job>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get active AI / LLM status (Gemini, Ollama, Claude).
   */
  getLlmStatus(): Observable<any> {
    return this.http.get<any>('/api/llm/status');
  }
}
