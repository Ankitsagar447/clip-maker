const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const config = require('../config');

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

function hasValidCredentials() {
  return Boolean(
    config.youtubeClientId &&
    config.youtubeClientSecret &&
    !config.youtubeClientId.includes('your_') &&
    !config.youtubeClientSecret.includes('your_')
  );
}


function loadAuthData() {
  if (fs.existsSync(config.youtubeAuthFile)) {
    try {
      return JSON.parse(fs.readFileSync(config.youtubeAuthFile, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse youtube_auth.json:', e.message);
    }
  }
  // Check if persisted in environment variable (useful on Render/ephemeral disks)
  if (process.env.YOUTUBE_AUTH_JSON) {
    try {
      return JSON.parse(process.env.YOUTUBE_AUTH_JSON);
    } catch (e) {}
  }
  return null;
}

function saveAuthData(data) {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
  fs.writeFileSync(config.youtubeAuthFile, JSON.stringify(data, null, 2));
}

function getOAuth2Client() {
  if (!hasValidCredentials()) {
    return null;
  }
  const client = new google.auth.OAuth2(
    config.youtubeClientId,
    config.youtubeClientSecret,
    config.youtubeRedirectUri
  );

  // Automatically persist newly refreshed access tokens whenever Google rotates them
  client.on('tokens', (newTokens) => {
    console.log('[YouTube OAuth] Refreshed tokens received from Google API.');
    const current = loadAuthData() || {};
    const merged = {
      ...current,
      tokens: {
        ...(current.tokens || {}),
        ...newTokens,
      },
    };
    // Ensure existing refresh_token is never wiped out by an access-token-only refresh
    if (!newTokens.refresh_token && current.tokens?.refresh_token) {
      merged.tokens.refresh_token = current.tokens.refresh_token;
    }
    saveAuthData(merged);
  });

  return client;
}

function getAuthStatus() {
  const authData = loadAuthData();
  const hasCredentialsConfigured = hasValidCredentials();

  return {
    hasCredentialsConfigured,
    isConnected: Boolean(authData && authData.tokens),
    channel: authData ? authData.channel : null,
  };
}

function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    throw new Error(
      'YouTube OAuth credentials not configured. Please set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in backend/.env'
    );
  }

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: SCOPES,
  });
}

async function handleOAuthCallback(code) {
  const oauth2Client = getOAuth2Client();
  if (!oauth2Client) {
    throw new Error('OAuth2 Client is not configured');
  }

  const { tokens } = await oauth2Client.getToken(code);

  // Merge with existing tokens to ensure refresh_token is NEVER dropped on re-login
  const existingAuth = loadAuthData();
  const mergedTokens = {
    ...(existingAuth?.tokens || {}),
    ...tokens,
  };
  if (!tokens.refresh_token && existingAuth?.tokens?.refresh_token) {
    mergedTokens.refresh_token = existingAuth.tokens.refresh_token;
  }

  oauth2Client.setCredentials(mergedTokens);

  // Fetch connected YouTube channel details
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const channelRes = await youtube.channels.list({
    part: 'snippet,statistics',
    mine: true,
  });

  const item = channelRes.data.items?.[0];
  const channelInfo = item
    ? {
        id: item.id,
        title: item.snippet.title,
        customUrl: item.snippet.customUrl || '',
        avatar: item.snippet.thumbnails?.default?.url || '',
        subscriberCount: item.statistics?.subscriberCount || '0',
        connectedAt: new Date().toISOString(),
      }
    : {
        id: 'unknown',
        title: 'Connected YouTube Channel',
        avatar: '',
        connectedAt: new Date().toISOString(),
      };

  const authData = { tokens: mergedTokens, channel: channelInfo };
  saveAuthData(authData);
  console.log(`[YouTube OAuth] Successfully connected channel: "${channelInfo.title}" (${channelInfo.id})`);
  return authData;
}

function disconnect() {
  if (fs.existsSync(config.youtubeAuthFile)) {
    fs.unlinkSync(config.youtubeAuthFile);
  }
  return { success: true };
}

/**
 * Upload a video file to YouTube Shorts.
 */
async function uploadVideo({ filePath, title, description, tags, privacyStatus = 'private' }) {
  const authData = loadAuthData();
  const oauth2Client = getOAuth2Client();

  if (!authData || !authData.tokens || !oauth2Client) {
    // If not authenticated, return simulated dry-run result for local dev/testing
    console.warn('YouTube channel not connected. Simulating video upload for:', title);
    const mockId = 'mock_' + Math.random().toString(36).substring(2, 11);
    return {
      isSimulated: true,
      videoId: mockId,
      url: `https://www.youtube.com/shorts/${mockId}`,
      publishedAt: new Date().toISOString(),
    };
  }

  oauth2Client.setCredentials(authData.tokens);

  // Auto-refresh token listener
  oauth2Client.on('tokens', (tokens) => {
    const current = loadAuthData() || {};
    current.tokens = { ...current.tokens, ...tokens };
    saveAuthData(current);
  });

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const res = await youtube.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title: title || 'New Short #Shorts',
        description: description || 'Created with Clip Maker #Shorts',
        tags: tags || ['Shorts', 'viral'],
        categoryId: '22', // People & Blogs
      },
      status: {
        privacyStatus: privacyStatus || 'private', // 'public' | 'unlisted' | 'private'
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: (() => {
        if (!filePath || !fs.existsSync(filePath)) {
          throw new Error(`Video file does not exist on disk: ${filePath}`);
        }
        const stream = fs.createReadStream(filePath);
        stream.on('error', (err) => console.error('Video upload stream error:', err.message));
        return stream;
      })(),
    },
  });

  const videoId = res.data.id;
  return {
    isSimulated: false,
    videoId,
    url: `https://www.youtube.com/shorts/${videoId}`,
    publishedAt: new Date().toISOString(),
  };
}

module.exports = {
  getAuthStatus,
  getAuthUrl,
  handleOAuthCallback,
  disconnect,
  uploadVideo,
};
