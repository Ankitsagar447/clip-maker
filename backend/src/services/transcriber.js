const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 100 }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') {
          return reject(
            new Error(
              `'${cmd}' was not found on your PATH. Please install OpenAI Whisper (e.g. 'pip install -U openai-whisper') and ensure it is on your PATH.`
            )
          );
        }
        return reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      }
      resolve(stdout);
    });
  });
}

// Runs local OpenAI Whisper CLI (pip install -U openai-whisper) against the
// video's audio track and returns an array of { start, end, text } segments.
async function transcribe(videoPath, jobDir) {
  const base = path.basename(videoPath, path.extname(videoPath));
  const jsonPath = path.join(jobDir, `${base}.json`);

  if (fs.existsSync(jsonPath) && fs.statSync(jsonPath).size > 50) {
    console.log(`[Transcriber] Reusing existing transcript from ${jsonPath}`);
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    return (data.segments || []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    }));
  }

  await run(config.whisperPath, [
    videoPath,
    '--model', config.whisperModel,
    '--output_format', 'json',
    '--output_dir', jobDir,
    '--task', 'transcribe',
    '--fp16', 'False',
  ]);

  if (!fs.existsSync(jsonPath)) {
    throw new Error('Whisper did not produce the expected transcript JSON file');
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  return (data.segments || []).map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text.trim(),
  }));
}

module.exports = { transcribe };
