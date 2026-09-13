const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./src/config');
const jobsRouter = require('./src/routes/jobs');
const channelsRouter = require('./src/routes/channels');
const youtubeRouter = require('./src/routes/youtube');
const { runPipeline, enqueueJob, initQueue } = require('./src/services/pipeline');
const channelMonitor = require('./src/services/channelMonitor');
const uploadScheduler = require('./src/services/uploadScheduler');

const app = express();

app.use(cors());
app.use(express.json());

// Serve generated clip video files
app.use('/output', express.static(config.outputDir));

app.use('/api/jobs', jobsRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/youtube', youtubeRouter);

const { getProviderStatus } = require('./src/services/llmClient');

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/llm/status', async (req, res) => {
  try {
    res.json(await getProviderStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start background services & sequential queue runner
initQueue();
channelMonitor.startBackgroundMonitor(enqueueJob);
uploadScheduler.startBackgroundScheduler();

app.listen(config.port, () => {
  console.log(`Clip Maker backend listening on http://localhost:${config.port}`);
  console.log('Channel Auto-Pilot and YouTube Upload Scheduler started in background.');
});
