const { generateJson, detectActiveProvider } = require('./llmClient');

/**
 * Generate YouTube Shorts-ready metadata (title, description, tags)
 * for a generated clip using active AI provider (Gemini / Ollama / Claude) with template fallback.
 */
async function generateShortsMetadata({ clip, videoTitle, channelName }) {
  const provider = await detectActiveProvider();

  if (provider) {
    try {
      const prompt = `You are a social media manager crafting YouTube Shorts metadata for maximum views and engagement.
Source Video: "${videoTitle || 'Source Video'}"
Channel: "${channelName || 'Creator'}"
Clip Title: "${clip.title}"
Clip Hook: "${clip.hook || ''}"
Clip Duration: ${clip.durationSeconds} seconds

Respond with ONLY a JSON object in this exact format:
{
  "title": "Short catchy title under 70 chars with #Shorts",
  "description": "Engaging 2-3 sentence description emphasizing the hook, ending with a call to subscribe and 4-6 viral hashtags like #Shorts #viral #trending",
  "tags": ["Shorts", "viral", "trending", "clip", "education"]
}`;

      const parsed = await generateJson(prompt);
      if (parsed && typeof parsed === 'object') {
        return {
          title: parsed.title || `${clip.title} #Shorts`,
          description: parsed.description || getDefaultDescription(clip, channelName),
          tags: Array.isArray(parsed.tags) ? parsed.tags : ['Shorts', 'viral', 'trending'],
        };
      }
    } catch (err) {
      console.warn(`AI description generation (${provider}) failed, using template:`, err.message);
    }
  }

  // Fallback template
  return {
    title: sanitizeTitle(clip.title),
    description: getDefaultDescription(clip, channelName),
    tags: ['Shorts', 'viral', 'trending', 'clip', 'reels', 'youtube'],
  };
}

function sanitizeTitle(title) {
  let clean = (title || 'Must Watch Clip').trim();
  if (!clean.toLowerCase().includes('#shorts')) {
    clean = `${clean} #Shorts`;
  }
  if (clean.length > 95) {
    clean = clean.slice(0, 92) + '...';
  }
  return clean;
}

function getDefaultDescription(clip, channelName) {
  const hookLine = clip.hook ? `🔥 "${clip.hook}"\n\n` : '';
  const channelCredit = channelName ? `Original creator: ${channelName}\n\n` : '';
  return `${hookLine}${clip.title}

${channelCredit}Watch till the end for the full takeaway! Subscribe for more daily viral clips.

#Shorts #viral #trending #reels #fyp`;
}

module.exports = { generateShortsMetadata };
