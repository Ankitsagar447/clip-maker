function toSrtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msec = ms % 1000;
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msec, 3)}`;
}

// Builds SRT content for the segments that fall inside [clipStart, clipEnd],
// re-based so 0 = start of the clip (not the original video).
function buildSrtForWindow(segments, clipStart, clipEnd) {
  const lines = [];
  let index = 1;

  for (const seg of segments) {
    const segStart = Math.max(seg.start, clipStart);
    const segEnd = Math.min(seg.end, clipEnd);
    if (segEnd <= segStart) continue; // no overlap with this clip

    const relStart = segStart - clipStart;
    const relEnd = segEnd - clipStart;

    lines.push(String(index));
    lines.push(`${toSrtTime(relStart)} --> ${toSrtTime(relEnd)}`);
    lines.push(seg.text);
    lines.push('');
    index += 1;
  }

  return lines.join('\n');
}

// WebVTT format for browser <video><track> support
function buildVttForWindow(segments, clipStart, clipEnd) {
  const srt = buildSrtForWindow(segments, clipStart, clipEnd);
  return 'WEBVTT\n\n' + srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
}

module.exports = { buildSrtForWindow, buildVttForWindow };
