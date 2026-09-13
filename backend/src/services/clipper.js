const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { buildSrtForWindow, buildVttForWindow } = require('../utils/srt');

ffmpeg.setFfmpegPath(config.ffmpegPath);
ffmpeg.setFfprobePath(config.ffprobePath);

// Center-crop/scale to a 1080x1920 vertical frame.
const VERTICAL_FILTER =
  'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920';

function escapeForFilter(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

function runFfmpeg(command) {
  return new Promise((resolve, reject) => {
    command
      .on('error', (err) => {
        if (
          err.message &&
          (err.message.includes('Cannot find ffmpeg') ||
            err.message.includes('spawn ffmpeg ENOENT'))
        ) {
          return reject(
            new Error(
              'ffmpeg or ffprobe was not found on your system PATH. Please install it (e.g. "brew install ffmpeg").'
            )
          );
        }
        reject(err);
      })
      .on('end', () => resolve())
      .run();
  });
}

async function cutClip({ sourcePath, start, end, outPath, segments, jobDir, clipId }) {
  // Write SRT and WebVTT for subtitles and player captions
  const srtContent = buildSrtForWindow(segments, start, end);
  const srtPath = path.join(jobDir, `${clipId}.srt`);
  fs.writeFileSync(srtPath, srtContent);

  const vttContent = buildVttForWindow(segments, start, end);
  const vttPath = path.join(jobDir, `${clipId}.vtt`);
  fs.writeFileSync(vttPath, vttContent);

  const duration = Math.max(1, end - start);

  // Attempt 1: Try burned-in subtitles via libass (if ffmpeg build supports it)
  const subtitlesFilter = `subtitles=${escapeForFilter(srtPath)}:force_style='FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Alignment=2,MarginV=80'`;

  try {
    const cmd = ffmpeg(sourcePath)
      .setStartTime(start)
      .duration(duration)
      .videoFilters([VERTICAL_FILTER, subtitlesFilter])
      .outputOptions(['-c:a', 'aac', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21'])
      .output(outPath);

    await runFfmpeg(cmd);
    return { outPath, srtPath, vttPath };
  } catch (err) {
    console.warn(
      `[Clipper] Burned-in subtitles filter not supported on current ffmpeg build, muxing mov_text subtitle track & generating VTT...`
    );
    // Attempt 2: Clean 9:16 vertical crop with embedded mov_text subtitles
    const cmd = ffmpeg(sourcePath)
      .setStartTime(start)
      .duration(duration)
      .input(srtPath)
      .videoFilters([VERTICAL_FILTER])
      .outputOptions([
        '-c:a', 'aac',
        '-c:v', 'libx264',
        '-c:s', 'mov_text',
        '-preset', 'veryfast',
        '-crf', '21',
      ])
      .output(outPath);

    await runFfmpeg(cmd);
    return { outPath, srtPath, vttPath };
  }
}

module.exports = { cutClip };
