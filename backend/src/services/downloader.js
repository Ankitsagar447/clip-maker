const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 50 }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') {
          return reject(
            new Error(
              `'${cmd}' was not found on your PATH. Please install it (e.g. 'brew install ${cmd}' or 'pip install ${cmd}') and ensure it is available in your terminal.`
            )
          );
        }
        return reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      }
      resolve(stdout);
    });
  });
}

// Downloads a YouTube/Vimeo/Twitch/Kick URL to <jobDir>/source.mp4
async function downloadVideo(url, jobDir) {
  const targetPath = path.join(jobDir, 'source.mp4');
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1024) {
    console.log(`[Downloader] Reusing existing source video: ${targetPath}`);
    return targetPath;
  }
  const outputTemplate = path.join(jobDir, 'source.%(ext)s');
  await run(config.ytDlpPath, [
    url,
    '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
    '--merge-output-format', 'mp4',
    '-o', outputTemplate,
    '--no-playlist',
  ]);
  return targetPath;
}

// Returns duration in seconds using ffprobe
async function getDuration(videoPath) {
  const out = await run(config.ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ]);
  return parseFloat(out.trim());
}

module.exports = { downloadVideo, getDuration };
