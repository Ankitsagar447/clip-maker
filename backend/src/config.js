require('dotenv').config();
const path = require('path');

module.exports = {
  port: process.env.PORT || 4000,

  // Multi-provider LLM settings ('auto' | 'gemini' | 'ollama' | 'anthropic')
  llmProvider: process.env.LLM_PROVIDER || 'auto',

  // Google Gemini API (Free tier at https://aistudio.google.com/)
  geminiApiKey:
    process.env.GEMINI_API_KEY ||
    'AQ.Ab8RN6LCKgQYW_-F2LWIF16I5fA8WUrlngXlYuztfgWPL-7PeQ',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',

  // Local Ollama (100% free & local at http://localhost:11434/)
  ollamaHost: process.env.OLLAMA_HOST || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',

  // Anthropic Claude API (https://console.anthropic.com/)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',

  ytDlpPath: process.env.YT_DLP_PATH || 'yt-dlp',
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',

  whisperPath: process.env.WHISPER_PATH || 'whisper',
  whisperModel: process.env.WHISPER_MODEL || 'base',

  minClipSeconds: Number(process.env.MIN_CLIP_SECONDS || 25),
  maxClipSeconds: Number(process.env.MAX_CLIP_SECONDS || 75),
  maxClipsPerVideo: Number(process.env.MAX_CLIPS_PER_VIDEO || 6),

  dataDir: path.join(__dirname, '..', 'data'),
  outputDir: path.join(__dirname, '..', 'output'),
  jobsFile: path.join(__dirname, '..', 'data', 'jobs.json'),
  channelsFile: path.join(__dirname, '..', 'data', 'channels.json'),
  uploadQueueFile: path.join(__dirname, '..', 'data', 'uploadQueue.json'),
  youtubeAuthFile: path.join(__dirname, '..', 'data', 'youtube_auth.json'),

  youtubeClientId:
    process.env.YOUTUBE_CLIENT_ID ||
    '308073437930-hvus8jopjdh9ltj99l85d030qursurch.apps.googleusercontent.com',
  youtubeClientSecret:
    process.env.YOUTUBE_CLIENT_SECRET || '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',
  youtubeRedirectUri: (() => {
    const isCloud = Boolean(process.env.RENDER || process.env.NODE_ENV === 'production');
    const cloudUrl = (process.env.RENDER_EXTERNAL_URL || 'https://clip-maker-3.onrender.com').replace(/\/$/, '');
    const envUri = process.env.YOUTUBE_REDIRECT_URI;
    if (isCloud && (!envUri || envUri.includes('localhost'))) {
      return `${cloudUrl}/api/youtube/oauth2callback`;
    }
    return envUri || 'http://localhost:4000/api/youtube/oauth2callback';
  })(),
  frontendUrl: (() => {
    const isCloud = Boolean(process.env.RENDER || process.env.NODE_ENV === 'production');
    const envFrontend = process.env.FRONTEND_URL;
    if (isCloud && (!envFrontend || envFrontend.includes('localhost'))) {
      return 'https://makeclip.netlify.app';
    }
    return envFrontend || 'http://localhost:4200';
  })(),
  channelCheckIntervalMinutes: Number(process.env.CHANNEL_CHECK_INTERVAL_MINUTES || 30),
};
