const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// Simple JSON-file backed store. Good enough for a local/single-user app.
// Swap for Postgres/Mongo later if you need multi-user support.

let jobs = {};

function ensureDataDir() {
  if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(config.outputDir)) fs.mkdirSync(config.outputDir, { recursive: true });
}

function load() {
  ensureDataDir();
  if (fs.existsSync(config.jobsFile)) {
    try {
      jobs = JSON.parse(fs.readFileSync(config.jobsFile, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse jobs.json, starting fresh:', e.message);
      jobs = {};
    }
  }
}

function persist() {
  ensureDataDir();
  fs.writeFileSync(config.jobsFile, JSON.stringify(jobs, null, 2));
}

function createJob({ youtubeUrl }) {
  const id = uuidv4();
  const job = {
    id,
    youtubeUrl,
    status: 'queued', // queued -> downloading -> transcribing -> analyzing -> clipping -> done -> error
    progress: 0,
    error: null,
    clips: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  jobs[id] = job;
  persist();
  return job;
}

function getJob(id) {
  return jobs[id] || null;
}

function listJobs() {
  return Object.values(jobs).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function updateJob(id, patch) {
  if (!jobs[id]) return null;
  jobs[id] = { ...jobs[id], ...patch, updatedAt: new Date().toISOString() };
  persist();
  return jobs[id];
}

load();

module.exports = { createJob, getJob, listJobs, updateJob };
