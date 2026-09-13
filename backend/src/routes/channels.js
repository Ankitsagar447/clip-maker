const express = require('express');
const router = express.Router();
const channelMonitor = require('../services/channelMonitor');
const { runPipeline } = require('../services/pipeline');

// List all monitored channels
router.get('/', (req, res) => {
  res.json(channelMonitor.listChannels());
});

// Add a new channel to monitor
router.post('/', async (req, res) => {
  const { url, dailyUploadFrequency, privacyStatus, autoUpload, backlogMode, clipsPerVideo } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Channel url is required' });
  }

  try {
    const channel = await channelMonitor.addChannel({
      url,
      dailyUploadFrequency: Number(dailyUploadFrequency || 4),
      privacyStatus: privacyStatus || 'private',
      autoUpload: autoUpload !== undefined ? Boolean(autoUpload) : true,
      backlogMode: backlogMode !== undefined ? Boolean(backlogMode) : true,
      clipsPerVideo: Number(clipsPerVideo || 4),
    });
    res.status(201).json(channel);
  } catch (err) {
    console.error('Failed to add channel:', err);
    res.status(400).json({ error: err.message || 'Failed to inspect channel with yt-dlp' });
  }
});

// Update a channel's settings (frequency, privacy, autoUpload, backlogMode, clipsPerVideo)
router.patch('/:id', (req, res) => {
  const updated = channelMonitor.updateChannel(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Channel not found' });
  res.json(updated);
});

// Delete a monitored channel
router.delete('/:id', (req, res) => {
  const deleted = channelMonitor.deleteChannel(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Channel not found' });
  res.json({ success: true });
});

// Check a channel immediately for new videos (or fallback to backlog video if enabled)
router.post('/:id/check', async (req, res) => {
  try {
    const result = await channelMonitor.checkChannelForNewVideos(req.params.id, runPipeline);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Manually trigger processing of the next unclipped older video from this channel
router.post('/:id/process-backlog', async (req, res) => {
  try {
    const result = await channelMonitor.processNextBacklogVideo(req.params.id, runPipeline);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Manually clip a specific video link for this channel
router.post('/:id/clip-link', async (req, res) => {
  const { videoUrl } = req.body;
  if (!videoUrl) return res.status(400).json({ error: 'videoUrl is required' });

  try {
    const result = await channelMonitor.clipSpecificChannelVideo(
      req.params.id,
      videoUrl,
      runPipeline
    );
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Inspect a channel without saving (preview info)
router.post('/inspect', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  try {
    const info = await channelMonitor.inspectChannel(url);
    res.json(info);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
