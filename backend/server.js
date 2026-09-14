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

// Root endpoint for service status check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Clip Maker Backend API',
    health: '/api/health',
    frontend: config.frontendUrl
  });
});

const { execSync } = require('child_process');

// Temporary diagnostic endpoint to check installed binaries on hosting environment
app.get('/api/diag', (req, res) => {
  const check = (cmd) => {
    try {
      return execSync(`which ${cmd} || true`, { encoding: 'utf8' }).trim();
    } catch (e) {
      return 'error: ' + e.message;
    }
  };
  res.json({
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    env_PATH: process.env.PATH,
    ytdlp: check(config.ytDlpPath) || config.ytDlpPath,
    ffmpeg: check('ffmpeg'),
    ffprobe: check('ffprobe'),
    python3: check('python3'),
    curl: check('curl'),
  });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/llm/status', async (req, res) => {
  try {
    res.json(await getProviderStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { ensureYtDlp } = require('./src/utils/ensureYtDlp');

// Ensure yt-dlp is available before background services start
try {
  ensureYtDlp();
} catch (e) {
  console.error('[server] ensureYtDlp error:', e.message);
}

// Start background services & sequential queue runner
initQueue();
channelMonitor.startBackgroundMonitor(enqueueJob);
uploadScheduler.startBackgroundScheduler();

app.listen(config.port, () => {
  console.log(`Clip Maker backend listening on http://localhost:${config.port}`);
  console.log('Channel Auto-Pilot and YouTube Upload Scheduler started in background.');
});
