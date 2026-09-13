const express = require('express');
const router = express.Router();
const jobStore = require('../services/jobStore');
const { enqueueJob } = require('../services/pipeline');

// Create a new clipping job (or batch of jobs) for video URL(s)
router.post('/', (req, res) => {
  const { youtubeUrl, urls } = req.body;

  let urlList = [];
  if (Array.isArray(urls)) {
    urlList = urls.filter((u) => typeof u === 'string' && u.trim().length > 0);
  } else if (typeof youtubeUrl === 'string') {
    // Support newline, comma, or space separated multiple URLs
    urlList = youtubeUrl
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
  }

  if (urlList.length === 0) {
    return res.status(400).json({ error: 'Valid video URL is required' });
  }

  const createdJobs = [];
  for (const url of urlList) {
    const job = jobStore.createJob({ youtubeUrl: url });
    enqueueJob(job.id);
    createdJobs.push(job);
  }

  // Return single job if single URL submitted for complete backwards compatibility
  if (createdJobs.length === 1 && !Array.isArray(urls)) {
    return res.status(202).json(createdJobs[0]);
  }

  res.status(202).json({ success: true, count: createdJobs.length, jobs: createdJobs });
});

// List all jobs (most recent first)
router.get('/', (req, res) => {
  res.json(jobStore.listJobs());
});

// Get a single job's status/result
router.get('/:id', (req, res) => {
  const job = jobStore.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

module.exports = router;
