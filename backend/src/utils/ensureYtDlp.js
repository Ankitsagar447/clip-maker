const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function isExecutableInPath(cmd) {
  try {
    const res = execSync(`which ${cmd} 2>/dev/null || true`, { encoding: 'utf8' }).trim();
    return Boolean(res);
  } catch {
    return false;
  }
}

function ensureYtDlp() {
  if (isExecutableInPath('yt-dlp')) {
    console.log('[ensureYtDlp] yt-dlp is already available in PATH');
    return 'yt-dlp';
  }

  const binDir = path.join(__dirname, '..', '..', 'bin');
  const binPath = path.join(binDir, 'yt-dlp');
  const nodeBinDir = path.join(__dirname, '..', '..', 'node_modules', '.bin');
  const nodeBinPath = path.join(nodeBinDir, 'yt-dlp');

  if (fs.existsSync(binPath)) {
    try {
      fs.chmodSync(binPath, 0o755);
      return binPath;
    } catch (e) {}
  }

  if (fs.existsSync(nodeBinPath)) {
    try {
      fs.chmodSync(nodeBinPath, 0o755);
      return nodeBinPath;
    } catch (e) {}
  }

  console.log('[ensureYtDlp] yt-dlp not found in PATH, downloading standalone binary...');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  try {
    execSync(`curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "${binPath}"`, {
      stdio: 'inherit',
      timeout: 60000,
    });
    fs.chmodSync(binPath, 0o755);

    if (fs.existsSync(nodeBinDir)) {
      try {
        fs.copyFileSync(binPath, nodeBinPath);
        fs.chmodSync(nodeBinPath, 0o755);
      } catch (e) {}
    }

    console.log('[ensureYtDlp] Successfully installed yt-dlp to:', binPath);
    return binPath;
  } catch (err) {
    console.error('[ensureYtDlp] Failed to download yt-dlp binary:', err.message);
    return 'yt-dlp';
  }
}

if (require.main === module) {
  ensureYtDlp();
}

module.exports = { ensureYtDlp };
