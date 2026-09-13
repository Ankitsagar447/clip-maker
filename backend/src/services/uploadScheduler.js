const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { generateShortsMetadata } = require('./descriptionGenerator');
const { uploadVideo, getAuthStatus } = require('./youtubeUploader');
const jobStore = require('./jobStore');

let queue = {};
let schedulerInterval = null;

function ensureDataDir() {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
}

function load() {
  ensureDataDir();
  if (fs.existsSync(config.uploadQueueFile)) {
    try {
      queue = JSON.parse(fs.readFileSync(config.uploadQueueFile, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse uploadQueue.json, starting fresh:', e.message);
      queue = {};
    }
  }
}

function persist() {
  ensureDataDir();
  fs.writeFileSync(config.uploadQueueFile, JSON.stringify(queue, null, 2));
}

function listQueue() {
  return Object.values(queue).sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
}

function getQueueItem(id) {
  return queue[id] || null;
}

function updateQueueItem(id, patch) {
  if (!queue[id]) return null;
  queue[id] = { ...queue[id], ...patch, updatedAt: new Date().toISOString() };
  persist();
  return queue[id];
}

function deleteQueueItem(id) {
  if (queue[id]) {
    delete queue[id];
    persist();
    return true;
  }
  return false;
}

/**
 * Enqueue clips from a finished job into the upload schedule.
 * Automatically computes spread upload times throughout the day based on daily frequency (1-20).
 */
async function scheduleClipUploads(job, channelSettings = {}) {
  const frequency = Math.min(20, Math.max(1, Number(channelSettings.dailyUploadFrequency || 4)));
  // Interval between uploads in milliseconds: 24h / frequency
  const intervalMs = Math.round((24 * 60 * 60 * 1000) / frequency);

  // Find the latest scheduled time currently in the queue
  const scheduledItems = listQueue().filter((item) => item.status === 'scheduled');
  let lastTime = Date.now() + 60 * 1000; // First slot: 1 minute from now

  if (scheduledItems.length > 0) {
    const latestExisting = Math.max(
      ...scheduledItems.map((i) => new Date(i.scheduledTime).getTime())
    );
    if (latestExisting > lastTime) {
      lastTime = latestExisting;
    }
  }

  const enqueuedItems = [];

  for (let i = 0; i < (job.clips || []).length; i++) {
    const clip = job.clips[i];
    const scheduledTime = new Date(lastTime + (i + 1) * intervalMs).toISOString();

    // Generate YouTube Shorts metadata
    const metadata = await generateShortsMetadata({
      clip,
      videoTitle: job.videoTitle || 'Source Video',
      channelName: channelSettings.name || 'Original Creator',
    });

    const fileName = path.basename(clip.url);
    const videoFilePath = path.join(config.outputDir, job.id, fileName);

    const queueId = uuidv4();
    const queueItem = {
      id: queueId,
      jobId: job.id,
      clipId: clip.id,
      clipUrl: clip.url,
      videoFilePath,
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      privacyStatus: channelSettings.privacyStatus || 'private', // 'public' | 'unlisted' | 'private'
      scheduledTime,
      dailyFrequency: frequency,
      status: 'scheduled', // 'scheduled' | 'uploading' | 'uploaded' | 'failed'
      error: null,
      youtubeVideoId: null,
      youtubeUrl: null,
      channelName: channelSettings.name || '',
      channelId: channelSettings.id || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    queue[queueId] = queueItem;
    enqueuedItems.push(queueItem);
  }

  persist();
  return enqueuedItems;
}

/**
 * Execute an upload immediately for a specific queue item.
 */
async function processUpload(id) {
  const item = queue[id];
  if (!item) return null;

  if (!item.videoFilePath || !fs.existsSync(item.videoFilePath)) {
    console.warn(
      `[Upload Scheduler] Video file does not exist on disk for queue item ${id}: ${item.videoFilePath}`
    );
    return updateQueueItem(id, {
      status: 'failed',
      error: 'Video file no longer exists on disk',
    });
  }

  updateQueueItem(id, { status: 'uploading', error: null });

  try {
    const result = await uploadVideo({
      filePath: item.videoFilePath,
      title: item.title,
      description: item.description,
      tags: item.tags,
      privacyStatus: item.privacyStatus,
    });

    // Clean up local video file to free disk space
    if (item.videoFilePath && fs.existsSync(item.videoFilePath)) {
      try {
        fs.unlinkSync(item.videoFilePath);
        console.log(`[Storage Cleanup] Deleted scheduled clip video: ${item.videoFilePath}`);
      } catch (e) {
        console.warn(`[Storage Cleanup] Could not delete ${item.videoFilePath}:`, e.message);
      }
    }

    // Sync to jobStore clip
    if (item.jobId && item.clipId) {
      const job = jobStore.getJob(item.jobId);
      if (job) {
        const c = (job.clips || []).find((x) => x.id === item.clipId);
        if (c) {
          c.youtubeUrl = result.url;
          c.youtubeVideoId = result.videoId;
          c.uploadedAt = result.publishedAt || new Date().toISOString();
          c.isSimulated = result.isSimulated || false;
          c.isPublished = true;
          c.published = true;
          c.videoDeleted = true;
        }
        const allDone = (job.clips || []).every((x) => x.isPublished || x.youtubeUrl);
        if (allDone) {
          const sourcePath = path.join(config.outputDir, item.jobId, 'source.mp4');
          if (fs.existsSync(sourcePath)) {
            try { fs.unlinkSync(sourcePath); } catch (e) {}
          }
          job.allPublished = true;
        }
        jobStore.updateJob(item.jobId, { clips: job.clips, allPublished: Boolean(job.allPublished) });
      }
    }

    return updateQueueItem(id, {
      status: 'uploaded',
      youtubeVideoId: result.videoId,
      youtubeUrl: result.url,
      isSimulated: result.isSimulated || false,
      uploadedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`Failed to upload queue item ${id}:`, err);
    return updateQueueItem(id, {
      status: 'failed',
      error: err.message || 'YouTube upload failed',
    });
  }
}

/**
 * Background loop that checks for due scheduled uploads every 30 seconds.
 */
function startBackgroundScheduler() {
  if (schedulerInterval) return;

  load();

  schedulerInterval = setInterval(async () => {
    const now = Date.now();
    const dueItems = listQueue().filter(
      (item) => item.status === 'scheduled' && new Date(item.scheduledTime).getTime() <= now
    );

    for (const item of dueItems) {
      console.log(`[Upload Scheduler] Processing scheduled upload for: "${item.title}"`);
      await processUpload(item.id);
    }
  }, 30000);
}

load();

/**
 * Upload a single clip immediately to the connected YouTube channel
 * with AI-generated title, hook, description, and hashtags.
 */
async function uploadSingleClipNow({ jobId, clipId, privacyStatus = 'public' }) {
  const job = jobStore.getJob(jobId);
  if (!job) throw new Error('Job not found');

  const clip = (job.clips || []).find((c) => c.id === clipId);
  if (!clip) throw new Error('Clip not found in job');

  const fileName = path.basename(clip.url);
  const videoFilePath = path.join(config.outputDir, jobId, fileName);

  if (!fs.existsSync(videoFilePath)) {
    throw new Error(`Video file not found at ${videoFilePath}`);
  }

  // 1. Generate YouTube Shorts title (#Shorts), hook description, and hashtags
  const metadata = await generateShortsMetadata({
    clip,
    videoTitle: job.videoTitle || 'Source Video',
    channelName: job.channelName || 'Toon Tiny TV',
  });

  // 2. Upload video file via YouTube Data API v3
  const uploadResult = await uploadVideo({
    filePath: videoFilePath,
    title: metadata.title,
    description: metadata.description,
    tags: metadata.tags,
    privacyStatus: privacyStatus || 'public',
  });

  // 3. Update the clip object in the job
  clip.youtubeUrl = uploadResult.url;
  clip.youtubeVideoId = uploadResult.videoId;
  clip.uploadedAt = uploadResult.publishedAt;
  clip.isSimulated = uploadResult.isSimulated;
  clip.isPublished = true;
  clip.published = true;
  clip.shortsTitle = metadata.title;
  clip.shortsDescription = metadata.description;
  clip.shortsTags = metadata.tags;

  // Clean up local video file to free disk space
  if (fs.existsSync(videoFilePath)) {
    try {
      fs.unlinkSync(videoFilePath);
      console.log(`[Storage Cleanup] Deleted local clip video file: ${videoFilePath}`);
    } catch (cleanupErr) {
      console.warn(`[Storage Cleanup] Could not delete clip file ${videoFilePath}:`, cleanupErr.message);
    }
  }
  clip.videoDeleted = true;

  // If all clips in this job are published, also delete source.mp4 to free storage
  const allPublished = (job.clips || []).every((c) => c.isPublished || c.youtubeUrl);
  if (allPublished) {
    const sourceVideoPath = path.join(config.outputDir, jobId, 'source.mp4');
    if (fs.existsSync(sourceVideoPath)) {
      try {
        fs.unlinkSync(sourceVideoPath);
        console.log(`[Storage Cleanup] All clips published! Deleted source video: ${sourceVideoPath}`);
      } catch (err) {}
    }
    job.allPublished = true;
  }

  jobStore.updateJob(jobId, { clips: job.clips, allPublished: Boolean(job.allPublished) });

  // 4. Register in upload queue as an 'uploaded' item
  const queueId = uuidv4();
  const queueItem = {
    id: queueId,
    jobId,
    clipId,
    clipUrl: clip.url,
    videoFilePath,
    title: metadata.title,
    description: metadata.description,
    tags: metadata.tags,
    privacyStatus: privacyStatus || 'public',
    scheduledTime: new Date().toISOString(),
    dailyFrequency: job.dailyUploadFrequency || 4,
    status: 'uploaded',
    error: null,
    youtubeVideoId: uploadResult.videoId,
    youtubeUrl: uploadResult.url,
    channelName: job.channelName || 'Toon Tiny TV',
    channelId: job.channelId || '',
    isSimulated: uploadResult.isSimulated,
    createdAt: new Date().toISOString(),
    uploadedAt: uploadResult.publishedAt,
    updatedAt: new Date().toISOString(),
  };

  queue[queueId] = queueItem;
  persist();

  return {
    success: true,
    clip,
    uploadResult,
    queueItem,
  };
}

/**
 * Upload all clips from a job immediately in sequence
 */
async function uploadAllJobClipsNow({ jobId, privacyStatus = 'public' }) {
  const job = jobStore.getJob(jobId);
  if (!job) throw new Error('Job not found');

  const results = [];
  for (const clip of job.clips || []) {
    try {
      const res = await uploadSingleClipNow({ jobId, clipId: clip.id, privacyStatus });
      results.push(res);
    } catch (err) {
      console.error(`Failed uploading clip ${clip.id}:`, err.message);
      results.push({ success: false, clipId: clip.id, error: err.message });
    }
  }

  return results;
}

module.exports = {
  listQueue,
  getQueueItem,
  updateQueueItem,
  deleteQueueItem,
  scheduleClipUploads,
  processUpload,
  startBackgroundScheduler,
  uploadSingleClipNow,
  uploadAllJobClipsNow,
};
