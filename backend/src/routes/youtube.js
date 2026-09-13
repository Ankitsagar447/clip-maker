const express = require('express');
const router = express.Router();
const config = require('../config');
const youtubeUploader = require('../services/youtubeUploader');
const uploadScheduler = require('../services/uploadScheduler');

// Get connection status and connected YouTube channel
router.get('/status', (req, res) => {
  res.json(youtubeUploader.getAuthStatus());
});

// Get Google OAuth consent URL
router.get('/auth-url', (req, res) => {
  try {
    const url = youtubeUploader.getAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// OAuth2 Callback from Google
router.get('/oauth2callback', async (req, res) => {
  const { code, error } = req.query;
  const baseUrl = config.frontendUrl.replace(/\/$/, '');
  if (error) {
    return res.redirect(`${baseUrl}/?youtube_error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return res.status(400).send('Authorization code missing');
  }

  try {
    await youtubeUploader.handleOAuthCallback(code);
    res.redirect(`${baseUrl}/?youtube_connected=true`);
  } catch (err) {
    console.error('Failed to exchange OAuth code:', err);
    res.redirect(
      `${baseUrl}/?youtube_error=${encodeURIComponent(err.message)}`
    );
  }
});

// Disconnect YouTube Channel
router.post('/disconnect', (req, res) => {
  res.json(youtubeUploader.disconnect());
});

// List upload queue (scheduled & uploaded clips)
router.get('/queue', (req, res) => {
  res.json(uploadScheduler.listQueue());
});

// Force immediate upload of a scheduled clip
router.post('/queue/:id/upload-now', async (req, res) => {
  const updated = await uploadScheduler.processUpload(req.params.id);
  if (!updated) return res.status(404).json({ error: 'Queue item not found' });
  res.json(updated);
});

// Remove clip from upload queue
router.delete('/queue/:id', (req, res) => {
  const ok = uploadScheduler.deleteQueueItem(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Queue item not found' });
  res.json({ success: true });
});

// Manually enqueue clips from an existing job
router.post('/schedule-job', async (req, res) => {
  const { job, dailyUploadFrequency, privacyStatus, channelName } = req.body;
  if (!job || !job.clips) {
    return res.status(400).json({ error: 'Valid job object with clips is required' });
  }

  try {
    const items = await uploadScheduler.scheduleClipUploads(job, {
      name: channelName || '',
      dailyUploadFrequency: Number(dailyUploadFrequency || 4),
      privacyStatus: privacyStatus || 'private',
    });
    res.status(201).json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Immediately upload a specific clip from a job to the connected YouTube channel
router.post('/upload-clip-now', async (req, res) => {
  const { jobId, clipId, privacyStatus } = req.body;
  if (!jobId || !clipId) {
    return res.status(400).json({ error: 'jobId and clipId are required' });
  }

  try {
    const result = await uploadScheduler.uploadSingleClipNow({ jobId, clipId, privacyStatus });
    res.json(result);
  } catch (err) {
    console.error('Failed to upload clip immediately:', err);
    res.status(500).json({ error: err.message });
  }
});

// Immediately upload all clips from a job to the connected YouTube channel
router.post('/upload-all-job-clips', async (req, res) => {
  const { jobId, privacyStatus } = req.body;
  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required' });
  }

  try {
    const results = await uploadScheduler.uploadAllJobClipsNow({ jobId, privacyStatus });
    res.json({ success: true, results });
  } catch (err) {
    console.error('Failed to upload all clips immediately:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
