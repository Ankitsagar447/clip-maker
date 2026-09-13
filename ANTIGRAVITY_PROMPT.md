# Project brief for Antigravity: "Clip Maker" (Local Ssemble/Opus-Clip Clone & YouTube Auto-Pilot)

This document describes the complete architecture, data models, workflows, and running instructions for **Clip Maker**.

---

## 1. What this app does

Clip Maker is a **local, self-hosted AI short-form video extraction studio and YouTube auto-publisher**. It operates in two modes:

### Mode A: Manual Video Clipping (Clips Studio)
The user pastes a video URL (YouTube, Vimeo, Twitch, Kick), and the app automatically:
1. Downloads the source video via `yt-dlp`.
2. Transcribes it locally with OpenAI Whisper (`whisper` CLI) with segment-level timestamps (no cloud speech APIs, 100% private).
3. Sends the transcript to AI (Google Gemini Free Tier, Local Ollama, or Anthropic Claude) to identify the most viral, hook-worthy 25–75 second segments, each with a catchy title and hook line.
4. Cuts those segments with `ffmpeg`, crops them to vertical 9:16 portrait, and burns in subtitles rebased from the transcript.
5. Displays a live dashboard with interactive 9:16 video players, titles, duration tags, and download links.

### Mode B: Channel Auto-Pilot & YouTube Auto-Uploader
The user adds YouTube channel URLs or `@handles` to monitor, and the app automatically:
1. **Monitors Channels**: Uses `yt-dlp --flat-playlist` to periodically detect newly published videos from the channel without requiring API keys.
2. **Auto-Clips New Videos**: Automatically runs the Whisper $\rightarrow$ AI $\rightarrow$ FFmpeg clipping pipeline when a new video is posted (extracting 4 viral clips).
3. **Past Video Backlog Mode**: If no new videos have been posted recently, the system automatically falls back to clipping older/past uploaded videos from that channel's catalog (4 clips per video), recording each processed video to prevent unwanted duplicates.
4. **Manual Trigger & Link Clipper**: Allows users to immediately click "⚡ Clip Older Video" or paste any specific video URL from that channel to generate and schedule 4 Shorts on demand.
5. **AI Shorts Description & SEO**: Generates viral titles (with `#Shorts`), engaging descriptions with hooks, and hashtags for each clip via the active AI provider.
6. **Daily Upload Frequency Scheduler (1 to 20 videos/day)**: Evenly distributes uploads throughout the whole day (e.g. 4 videos/day = 1 video every 6 hours; 12 videos/day = 1 video every 2 hours).
7. **YouTube Data API v3 Auto-Upload**: Uses Google OAuth2 to upload clips directly as YouTube Shorts (with customizable privacy: `private`, `unlisted`, or `public`) with simulation/dry-run support.

---

## 2. Tech Stack

- **Backend:** Node.js + Express (CommonJS).
- **Frontend:** Angular 17, standalone components, `ApplicationConfig` bootstrap, native CSS with `#0f1115` dark glassmorphism design.
- **Video Processing:** `ffmpeg` and `ffprobe` (via `fluent-ffmpeg` and child processes).
- **Video & Channel Extraction:** `yt-dlp` CLI (downloads videos and queries channel video feeds).
- **Speech-to-Text Transcription:** Local OpenAI Whisper CLI (`whisper` with PyTorch, `--model base`, `--output_format json`).
- **Multi-Provider AI Analysis & SEO (`llmClient.js`):**
  - **Google Gemini API (Free Tier):** Default model `gemini-3.6-flash` with automatic fallback to `gemini-flash-lite-latest` and `gemini-flash-latest`. Free keys from Google AI Studio.
  - **Local Ollama (100% Free & Offline):** Runs locally on Mac (`ollama run llama3.2`) with zero external API calls.
  - **Anthropic Claude:** `claude-sonnet-4-6` via Messages API.
  - **Auto-Provider Router:** Automatically detects which provider is configured and available without manual switching.
- **YouTube Shorts Auto-Uploader:** Google APIs Client Library (`googleapis`) with YouTube Data API v3 OAuth2.
- **Persistence:** Local JSON file stores in `backend/data/`:
  - `jobs.json`: manual & automated clipping jobs.
  - `channels.json`: monitored channels & daily upload settings.
  - `uploadQueue.json`: scheduled and published YouTube Shorts queue.
  - `youtube_auth.json`: YouTube OAuth2 access and refresh tokens.
- **Background Engines:**
  - Channel Monitor: checks monitored channels for new uploads on a configurable timer (default: 30 minutes).
  - Upload Scheduler: checks pending uploads every 30-60 seconds and uploads clips whose scheduled time has arrived.

---

## 3. Directory Structure

```
clip-maker/
  backend/
    .env.example                  # Environment template (Anthropic, YouTube OAuth, intervals)
    .env                          # Local environment config
    package.json
    server.js                     # Express app entry point, mounts routes, starts background loops
    data/                         # Flat JSON data stores (gitignored)
      jobs.json                   # Clipping jobs state
      channels.json               # Monitored YouTube channels
      uploadQueue.json            # Scheduled & completed uploads
      youtube_auth.json           # YouTube OAuth2 credentials
    output/                       # Generated job folders with source videos + 9:16 clips
    src/
      config.js                   # Reads env vars, exposes paths and tuning knobs
      routes/
        jobs.js                   # POST /, GET /, GET /:id
        channels.js               # GET /, POST /, PATCH /:id, DELETE /:id, POST /:id/check
        youtube.js                # GET /status, GET /auth-url, GET /oauth2callback, GET /queue, POST /queue/:id/upload-now
      services/
        jobStore.js               # In-memory Map synced to data/jobs.json
        downloader.js             # yt-dlp wrapper: downloadVideo(), getDuration()
        transcriber.js            # Whisper CLI wrapper: transcribe() -> segments[]
        viralDetector.js          # Claude API: detectViralMoments()
        clipper.js                # fluent-ffmpeg: cutClip() 9:16 crop + subtitles
        pipeline.js               # Orchestrates clipping flow + autoUpload hook
        channelMonitor.js         # yt-dlp flat playlist extraction & new video checker
        descriptionGenerator.js   # Claude AI Shorts title, description, and tags generator
        youtubeUploader.js        # Google OAuth2 & YouTube Data API v3 video uploader
        uploadScheduler.js        # 1-20/day frequency distributor & upload queue processor
      utils/
        srt.js                    # buildSrtForWindow() -> rebased .srt subtitles

  frontend/
    angular.json
    package.json
    proxy.conf.json               # Proxies /api and /output to http://localhost:4000
    tsconfig.json / tsconfig.app.json
    src/
      index.html
      styles.css                  # Global design tokens, dark theme (#0f1115), scrollbars, animations
      main.ts                     # bootstrapApplication(AppComponent, appConfig)
      app/
        app.config.ts             # provideHttpClient()
        app.component.ts          # Root component with Tab navigation
        models/
          job.model.ts            # Job, Clip, JobStatus interfaces
          channel.model.ts        # MonitoredChannel, UploadQueueItem, YouTubeStatus interfaces
        services/
          job.service.ts          # HTTP client for /api/jobs
          channel.service.ts      # HTTP client for /api/channels and /api/youtube
        components/
          upload-form/            # Manual video URL submission card
          job-list/               # Live job cards, progress bar, 9:16 video players, download links
          channel-autopilot/      # Channel URL input, 1-20 frequency slider, monitored channel cards
          youtube-scheduler/      # YouTube OAuth card, scheduled timeline, published Shorts list
```

---

## 4. Backend API Contract

### Jobs API (`/api/jobs`)
- **`POST /api/jobs`**: Create a new clipping job `{ "youtubeUrl": "..." }`. Returns created `Job` with `status: "queued"`.
- **`GET /api/jobs`**: Returns array of all jobs (newest first).
- **`GET /api/jobs/:id`**: Returns a single job (polled by frontend during processing).

### Channel Auto-Pilot API (`/api/channels`)
- **`GET /api/channels`**: List all monitored channels.
- **`POST /api/channels`**: Add channel to monitor.
  - Body: `{ "url": "https://youtube.com/@channel", "dailyUploadFrequency": 4, "privacyStatus": "private", "autoUpload": true }`
  - Inspects channel with `yt-dlp`, saves channel metadata and existing video IDs.
- **`POST /api/channels/:id/check`**: Check channel immediately for newly published videos. If no new videos exist and Backlog Mode is enabled, automatically clips the next older past video (4 clips).
- **`POST /api/channels/:id/process-backlog`**: Manually force-clip the next unclipped older video from the channel's past catalog.
- **`POST /api/channels/:id/clip-link`**: Manually clip a specific video link from this channel `{ "videoUrl": "..." }` and schedule 4 Shorts.

### YouTube Scheduler & Upload API (`/api/youtube`)
- **`GET /api/youtube/status`**: Check OAuth connection state and connected channel profile.
- **`GET /api/youtube/auth-url`**: Generates Google OAuth2 consent URL.
- **`GET /api/youtube/oauth2callback`**: OAuth redirect callback handling token exchange.
- **`POST /api/youtube/disconnect`**: Disconnect YouTube channel.
- **`GET /api/youtube/queue`**: List scheduled, uploading, and published queue items.
- **`POST /api/youtube/queue/:id/upload-now`**: Force immediate upload of a scheduled clip.
- **`DELETE /api/youtube/queue/:id`**: Remove a clip from the upload schedule.
- **`POST /api/youtube/schedule-job`**: Enqueue clips from an existing job with custom frequency settings.
- **`POST /api/youtube/upload-clip-now`**: Immediately upload a specific clip from a job directly to YouTube with auto AI metadata (`#Shorts` title, hook description, tags).
- **`POST /api/youtube/upload-all-job-clips`**: Immediately upload all clips of a completed job to YouTube in sequence.

---

## 5. Daily Frequency Scheduling Algorithm

When clips are generated for a channel or job with `autoUpload: true`:
1. User specifies daily upload frequency $F \in [1, 20]$ videos/day.
2. The engine computes the spacing interval:
   $$\text{Interval (ms)} = \frac{24 \times 60 \times 60 \times 1000}{F}$$
   - $F = 4$: 1 clip uploaded every 6 hours.
   - $F = 12$: 1 clip uploaded every 2 hours.
   - $F = 20$: 1 clip uploaded every 1.2 hours (72 minutes).
3. Slots are assigned sequentially starting from the latest scheduled item in the queue or `now + 1 minute`.
4. Claude AI (or template fallback) generates an optimized title (under 70 chars with `#Shorts`), description (with hook and subscribe CTA), and viral tags for each clip.
5. The background scheduler evaluates the queue every 30-60 seconds and uploads clips whose scheduled time has arrived via YouTube Data API v3.

---

## 6. Environment Setup

### Prerequisites
- Node.js 18+
- `ffmpeg` and `ffprobe` on PATH (`brew install ffmpeg`)
- `yt-dlp` on PATH (`brew install yt-dlp`)
- `whisper` on PATH (`pip install -U openai-whisper`)
- Anthropic API Key (`ANTHROPIC_API_KEY`)
- Optional for live YouTube uploads: Google Cloud OAuth 2.0 Client Credentials (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`)

### Running Locally
```bash
# 1. Start Backend
cd backend
cp .env.example .env    # Fill in ANTHROPIC_API_KEY (and optional YOUTUBE_CLIENT_ID)
npm install
npm run dev              # Runs on http://localhost:4000

# 2. Start Frontend
cd ../frontend
npm install
npm start                # Angular dev server with proxy, http://localhost:4200
```
