const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const jobStore = require('./jobStore');
const { downloadVideo, getDuration } = require('./downloader');
const { transcribe } = require('./transcriber');
const { detectViralMoments } = require('./viralDetector');
const { cutClip } = require('./clipper');
const { scheduleClipUploads } = require('./uploadScheduler');

// Sequential Queue State
let activeJobId = null;
let isProcessingLoopRunning = false;

/**
 * Execute the full downloading -> transcription -> AI detection -> clipping pipeline for a job
 */
async function executePipeline(jobId, options = {}) {
  const jobDir = path.join(config.outputDir, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  try {
    const job = jobStore.getJob(jobId);
    if (!job) {
      console.warn(`[Pipeline] Job ${jobId} not found, skipping.`);
      return;
    }

    console.log(`[Pipeline] Starting sequential execution for job ${jobId} (${job.youtubeUrl})...`);

    // 1. Download
    jobStore.updateJob(jobId, { status: 'downloading', progress: 10, error: null });
    const sourcePath = await downloadVideo(job.youtubeUrl, jobDir);
    const duration = await getDuration(sourcePath);

    // 2. Transcribe (local Whisper)
    jobStore.updateJob(jobId, { status: 'transcribing', progress: 35 });
    const segments = await transcribe(sourcePath, jobDir);

    // 3. Ask LLM which moments are clip-worthy
    jobStore.updateJob(jobId, { status: 'analyzing', progress: 55 });
    const maxClips = options.maxClips || job.maxClips || 4;
    const moments = await detectViralMoments(segments, duration, maxClips);

    if (moments.length === 0) {
      jobStore.updateJob(jobId, {
        status: 'error',
        error: 'No clip-worthy moments were found in this video.',
      });
      return;
    }

    // 4. Cut + caption each moment
    jobStore.updateJob(jobId, { status: 'clipping', progress: 70 });
    const clips = [];
    for (let i = 0; i < moments.length; i++) {
      const m = moments[i];
      const clipId = uuidv4();
      const fileName = `clip_${i + 1}.mp4`;
      const outPath = path.join(jobDir, fileName);

      await cutClip({
        sourcePath,
        start: m.start,
        end: m.end,
        outPath,
        segments,
        jobDir,
        clipId,
      });

      clips.push({
        id: clipId,
        title: m.title,
        hook: m.hook,
        start: m.start,
        end: m.end,
        durationSeconds: Math.round(m.end - m.start),
        url: `/output/${jobId}/${fileName}`,
        srtUrl: `/output/${jobId}/${clipId}.srt`,
        vttUrl: `/output/${jobId}/${clipId}.vtt`,
        isPublished: false,
        videoDeleted: false,
      });

      jobStore.updateJob(jobId, {
        progress: 70 + Math.round(((i + 1) / moments.length) * 25),
      });
    }

    const completedJob = jobStore.updateJob(jobId, {
      status: 'done',
      progress: 100,
      error: null,
      clips,
    });

    console.log(`[Pipeline] Finished job ${jobId} successfully with ${clips.length} clips.`);

    // Auto-schedule uploads if enabled for this job/channel
    const shouldAutoUpload = options.autoUpload || job.autoUpload;
    if (shouldAutoUpload && clips.length > 0) {
      console.log(`[Pipeline] Auto-scheduling ${clips.length} clips for YouTube upload...`);
      const channelSettings = options.channelSettings || {
        name: job.channelName || '',
        dailyUploadFrequency: job.dailyUploadFrequency || 4,
        privacyStatus: job.privacyStatus || 'private',
        id: job.channelId || '',
      };
      await scheduleClipUploads(completedJob, channelSettings);
    }
  } catch (err) {
    console.error(`[Pipeline] Failed for job ${jobId}:`, err);
    jobStore.updateJob(jobId, { status: 'error', error: err.message });
  }
}

/**
 * Check the queue and process the next queued job sequentially (1 at a time)
 */
async function processQueue() {
  if (activeJobId || isProcessingLoopRunning) {
    // A video is currently already being processed
    return;
  }

  isProcessingLoopRunning = true;

  try {
    const allJobs = jobStore.listJobs();
    // Find all queued jobs and sort by oldest createdAt first (FIFO)
    const queuedJobs = allJobs
      .filter((j) => j.status === 'queued')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    if (queuedJobs.length === 0) {
      return;
    }

    const nextJob = queuedJobs[0];
    activeJobId = nextJob.id;
    console.log(`[Queue Runner] Processing 1 job at a time. Active: ${nextJob.id} (${nextJob.youtubeUrl}) | Remaining in queue: ${queuedJobs.length - 1}`);

    await executePipeline(nextJob.id, nextJob.pipelineOptions || {});
  } finally {
    activeJobId = null;
    isProcessingLoopRunning = false;
    // Check if another job is waiting in the queue
    const hasMore = jobStore.listJobs().some((j) => j.status === 'queued');
    if (hasMore) {
      setTimeout(() => {
        processQueue();
      }, 1000);
    }
  }
}

/**
 * Enqueue a job to be processed sequentially
 */
function enqueueJob(jobId, options = {}) {
  jobStore.updateJob(jobId, { pipelineOptions: options });
  // Trigger queue check asynchronously
  setImmediate(() => {
    processQueue();
  });
}

/**
 * Initialize queue on server startup: reset any stuck in-progress jobs to queued and start runner
 */
function initQueue() {
  const allJobs = jobStore.listJobs();
  let resetCount = 0;
  for (const job of allJobs) {
    if (['downloading', 'transcribing', 'analyzing', 'clipping'].includes(job.status)) {
      jobStore.updateJob(job.id, {
        status: 'queued',
        progress: 0,
        error: null,
      });
      resetCount++;
    }
  }
  if (resetCount > 0) {
    console.log(`[Queue Runner] Reset ${resetCount} interrupted jobs back to 'queued' state.`);
  }

  processQueue();
}

module.exports = {
  runPipeline: enqueueJob,
  enqueueJob,
  processQueue,
  initQueue,
  getActiveJobId: () => activeJobId,
};
