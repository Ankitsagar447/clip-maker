const config = require('../config');
const { generateJson } = require('./llmClient');

function formatTranscript(segments) {
  return segments
    .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join('\n');
}

// Asks the LLM (Gemini / Ollama / Claude) to pick the most engaging segments of the video and return
// timestamps + a hook title for each. Returns array of { start, end, title, hook }.
async function detectViralMoments(segments, durationSeconds, maxClips = config.maxClipsPerVideo) {
  const limit = Math.max(1, Number(maxClips || config.maxClipsPerVideo));
  const transcript = formatTranscript(segments);

  const prompt = `You are picking the best short-form clip moments from a long video transcript for TikTok/YouTube Shorts/Instagram Reels.

Video duration: ${durationSeconds.toFixed(0)} seconds.
Each clip must be between ${config.minClipSeconds} and ${config.maxClipSeconds} seconds long.
Pick at most ${limit} non-overlapping clips, ranked by how engaging/shareable they'd be as a standalone short.

Transcript (format is [start-end] text):
${transcript}

Respond with ONLY a JSON array, no other text, in this exact shape:
[
  {"start": 12.4, "end": 55.1, "title": "short catchy title", "hook": "first-line hook to put as an on-screen caption overlay"}
]`;

  const moments = await generateJson(prompt);

  if (!Array.isArray(moments)) {
    throw new Error('AI Model did not return an array of clips');
  }

  // Basic sanitation / clamping
  return moments
    .filter((m) => typeof m.start === 'number' && typeof m.end === 'number' && m.end > m.start)
    .map((m) => ({
      start: Math.max(0, m.start),
      end: Math.min(durationSeconds, m.end),
      title: m.title || 'Untitled clip',
      hook: m.hook || '',
    }))
    .filter((m) => m.end - m.start >= config.minClipSeconds - 2)
    .slice(0, limit);
}

module.exports = { detectViralMoments };
