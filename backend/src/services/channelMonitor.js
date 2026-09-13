const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const jobStore = require('./jobStore');

let channels = {};
let monitorInterval = null;

function ensureDataDir() {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
}

function ensureChannelDefaults(channel) {
  if (channel.backlogMode === undefined) channel.backlogMode = true;
  if (channel.clipsPerVideo === undefined) channel.clipsPerVideo = 4;
  if (!Array.isArray(channel.clippedHistory)) channel.clippedHistory = [];
  if (!Array.isArray(channel.processedVideoIds)) channel.processedVideoIds = [];
}

function load() {
  ensureDataDir();
  if (fs.existsSync(config.channelsFile)) {
    try {
      channels = JSON.parse(fs.readFileSync(config.channelsFile, 'utf-8'));
      Object.values(channels).forEach(ensureChannelDefaults);
    } catch (e) {
      console.error('Failed to parse channels.json, starting fresh:', e.message);
      channels = {};
    }
  }
}

function persist() {
  ensureDataDir();
  fs.writeFileSync(config.channelsFile, JSON.stringify(channels, null, 2));
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile(
      config.ytDlpPath,
      args,
      { maxBuffer: 1024 * 1024 * 50 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`yt-dlp failed: ${stderr || err.message}`));
        resolve(stdout);
      }
    );
  });
}

/**
 * Format channel URL so yt-dlp targets the videos tab directly
 */
function normalizeChannelUrl(rawUrl) {
  let url = rawUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://www.youtube.com/${url.startsWith('@') ? url : '@' + url}`;
  }
  // If no subpath is provided, target /videos
  if (
    url.includes('youtube.com') &&
    !url.endsWith('/videos') &&
    !url.endsWith('/shorts') &&
    !url.includes('/watch')
  ) {
    url = url.replace(/\/$/, '') + '/videos';
  }
  return url;
}

/**
 * Fetch channel details and recent videos via yt-dlp
 */
async function inspectChannel(channelUrl, maxEntries = 25) {
  const targetUrl = normalizeChannelUrl(channelUrl);

  const rawJson = await runYtDlp([
    '--flat-playlist',
    '--dump-single-json',
    '--playlist-end', String(maxEntries || 25),
    '--no-warnings',
    targetUrl,
  ]);

  const data = JSON.parse(rawJson);

  const entries = (data.entries || []).map((e) => ({
    id: e.id,
    title: e.title,
    url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
    duration: e.duration || 0,
    thumbnail: e.thumbnails?.[0]?.url || '',
  }));

  const avatar =
    data.thumbnails?.find((t) => t.id === 'avatar_uncropped')?.url ||
    data.thumbnails?.[0]?.url ||
    '';

  return {
    channelId: data.channel_id || data.id || uuidv4(),
    name: data.channel || data.uploader || data.title || 'YouTube Creator',
    handle: data.uploader_id || '',
    url: targetUrl,
    avatar,
    subscribers: data.channel_follower_count || null,
    entries,
  };
}

/**
 * Add a new channel to monitor
 */
async function addChannel({
  url,
  dailyUploadFrequency = 4,
  privacyStatus = 'private',
  autoUpload = true,
  backlogMode = true,
  clipsPerVideo = 4,
}) {
  const info = await inspectChannel(url, 25);
  const id = info.channelId || uuidv4();

  const existing = channels[id];
  const channelObj = {
    id,
    name: info.name,
    handle: info.handle,
    url: info.url,
    avatar: info.avatar || existing?.avatar,
    subscribers: info.subscribers || existing?.subscribers,
    dailyUploadFrequency: Math.min(20, Math.max(1, Number(dailyUploadFrequency || 4))),
    privacyStatus: privacyStatus || 'private',
    autoUpload: Boolean(autoUpload),
    backlogMode: backlogMode !== undefined ? Boolean(backlogMode) : true,
    clipsPerVideo: Math.min(6, Math.max(1, Number(clipsPerVideo || 4))),
    clippedHistory: existing?.clippedHistory || [],
    // Only mark the single latest video as seen so remaining catalog serves as backlog
    processedVideoIds: existing?.processedVideoIds?.length
      ? existing.processedVideoIds
      : info.entries.length > 0
      ? [info.entries[0].id]
      : [],
    lastChecked: new Date().toISOString(),
    createdAt: existing?.createdAt || new Date().toISOString(),
  };

  channels[id] = channelObj;
  persist();
  return { ...channelObj, recentVideos: info.entries };
}

function listChannels() {
  return Object.values(channels).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

function getChannel(id) {
  return channels[id] || null;
}

function updateChannel(id, patch) {
  if (!channels[id]) return null;
  channels[id] = { ...channels[id], ...patch, updatedAt: new Date().toISOString() };
  persist();
  return channels[id];
}

function deleteChannel(id) {
  if (channels[id]) {
    delete channels[id];
    persist();
    return true;
  }
  return false;
}

/**
 * Check a monitored channel for new videos (or fallback to backlog video) and trigger clipping pipeline
 */
async function checkChannelForNewVideos(channelId, pipelineRunner, options = {}) {
  const channel = channels[channelId];
  if (!channel) throw new Error('Channel not found');

  ensureChannelDefaults(channel);

  const info = await inspectChannel(channel.url, 25);
  const newVideos = info.entries.filter(
    (entry) => !channel.processedVideoIds.includes(entry.id)
  );

  const triggeredJobs = [];
  let isBacklog = false;
  const clipsPerVid = channel.clipsPerVideo || 4;

  if (newVideos.length > 0 && !options.forceBacklog) {
    for (const video of newVideos) {
      console.log(
        `[Channel Auto-Pilot] New video detected from ${channel.name}: "${video.title}" (${video.url})`
      );

      const job = jobStore.createJob({
        youtubeUrl: video.url,
        videoTitle: video.title,
        channelId: channel.id,
        channelName: channel.name,
        autoUpload: channel.autoUpload,
        dailyUploadFrequency: channel.dailyUploadFrequency,
        privacyStatus: channel.privacyStatus,
        maxClips: clipsPerVid,
      });

      if (pipelineRunner) {
        pipelineRunner(job.id, {
          autoUpload: channel.autoUpload,
          maxClips: clipsPerVid,
          channelSettings: channel,
        });
      }

      channel.processedVideoIds.push(video.id);
      channel.clippedHistory.unshift({
        videoId: video.id,
        title: video.title,
        url: video.url,
        clippedAt: new Date().toISOString(),
        clipsCount: clipsPerVid,
        jobId: job.id,
        isBacklog: false,
      });
      triggeredJobs.push(job);
    }
  } else if (channel.backlogMode || options.forceBacklog) {
    // Old Video Backlog Mode: Pick the next unclipped past video from catalog
    const nextOldVideo = info.entries.find(
      (entry) => !channel.processedVideoIds.includes(entry.id)
    );

    if (nextOldVideo) {
      isBacklog = true;
      console.log(
        `[Channel Auto-Pilot] Backlog Mode: Clipping older video for ${channel.name}: "${nextOldVideo.title}" (${nextOldVideo.url})`
      );

      const job = jobStore.createJob({
        youtubeUrl: nextOldVideo.url,
        videoTitle: nextOldVideo.title,
        channelId: channel.id,
        channelName: channel.name,
        autoUpload: channel.autoUpload,
        dailyUploadFrequency: channel.dailyUploadFrequency,
        privacyStatus: channel.privacyStatus,
        maxClips: clipsPerVid,
      });

      if (pipelineRunner) {
        pipelineRunner(job.id, {
          autoUpload: channel.autoUpload,
          maxClips: clipsPerVid,
          channelSettings: channel,
        });
      }

      channel.processedVideoIds.push(nextOldVideo.id);
      channel.clippedHistory.unshift({
        videoId: nextOldVideo.id,
        title: nextOldVideo.title,
        url: nextOldVideo.url,
        clippedAt: new Date().toISOString(),
        clipsCount: clipsPerVid,
        jobId: job.id,
        isBacklog: true,
      });
      triggeredJobs.push(job);
    } else {
      console.log(
        `[Channel Auto-Pilot] No unclipped older videos found in recent 25 catalog for ${channel.name}`
      );
    }
  }

  channel.lastChecked = new Date().toISOString();
  persist();

  return {
    channel,
    newVideosCount: triggeredJobs.length,
    isBacklog,
    triggeredJobs,
    recentVideos: info.entries,
  };
}

/**
 * Manually force processing the next older unclipped video from channel catalog
 */
async function processNextBacklogVideo(channelId, pipelineRunner) {
  return checkChannelForNewVideos(channelId, pipelineRunner, { forceBacklog: true });
}

/**
 * Manually clip a specific video URL for a channel and schedule uploads
 */
async function clipSpecificChannelVideo(channelId, videoUrl, pipelineRunner) {
  const channel = channels[channelId];
  if (!channel) throw new Error('Channel not found');

  ensureChannelDefaults(channel);

  const rawJson = await runYtDlp([
    '--dump-single-json',
    '--no-warnings',
    videoUrl,
  ]);
  const data = JSON.parse(rawJson);
  const videoId = data.id || uuidv4();
  const videoTitle = data.title || 'Manual Video Clip';
  const targetUrl = data.webpage_url || videoUrl;
  const clipsPerVid = channel.clipsPerVideo || 4;

  console.log(
    `[Channel Auto-Pilot] Manually clipping video for ${channel.name}: "${videoTitle}" (${targetUrl})`
  );

  const job = jobStore.createJob({
    youtubeUrl: targetUrl,
    videoTitle,
    channelId: channel.id,
    channelName: channel.name,
    autoUpload: channel.autoUpload,
    dailyUploadFrequency: channel.dailyUploadFrequency,
    privacyStatus: channel.privacyStatus,
    maxClips: clipsPerVid,
  });

  if (pipelineRunner) {
    pipelineRunner(job.id, {
      autoUpload: channel.autoUpload,
      maxClips: clipsPerVid,
      channelSettings: channel,
    });
  }

  if (!channel.processedVideoIds.includes(videoId)) {
    channel.processedVideoIds.push(videoId);
  }
  channel.clippedHistory.unshift({
    videoId,
    title: videoTitle,
    url: targetUrl,
    clippedAt: new Date().toISOString(),
    clipsCount: clipsPerVid,
    jobId: job.id,
    isManual: true,
  });

  channel.lastChecked = new Date().toISOString();
  persist();

  return {
    channel,
    job,
    videoTitle,
    targetUrl,
  };
}

/**
 * Check all monitored channels
 */
async function checkAllChannels(pipelineRunner) {
  const allChannels = listChannels();
  const results = [];
  for (const ch of allChannels) {
    try {
      const res = await checkChannelForNewVideos(ch.id, pipelineRunner);
      results.push(res);
    } catch (err) {
      console.error(`Failed checking channel ${ch.name}:`, err.message);
    }
  }
  return results;
}

/**
 * Start background timer to check channels automatically
 */
function startBackgroundMonitor(pipelineRunner) {
  if (monitorInterval) return;

  load();
  const intervalMs = config.channelCheckIntervalMinutes * 60 * 1000;

  monitorInterval = setInterval(async () => {
    console.log('[Channel Auto-Pilot] Checking monitored channels for new uploads...');
    await checkAllChannels(pipelineRunner);
  }, intervalMs);
}

load();

module.exports = {
  inspectChannel,
  addChannel,
  listChannels,
  getChannel,
  updateChannel,
  deleteChannel,
  checkChannelForNewVideos,
  processNextBacklogVideo,
  clipSpecificChannelVideo,
  checkAllChannels,
  startBackgroundMonitor,
};
