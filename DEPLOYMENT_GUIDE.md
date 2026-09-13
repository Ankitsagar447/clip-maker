# Clip Maker — Free Deployment Guide 🚀

This guide explains how to deploy **Clip Maker** 100% free:
* **Frontend (Angular 17)**: Hosted on **Netlify** (Free Global CDN, instant builds, free SSL).
* **Backend (Node.js + FFmpeg + yt-dlp)**: Hosted on **Render.com** (Free Docker Web Service) or **Hugging Face Spaces** or via a **Cloudflare Tunnel** from your Mac.

---

## Architecture Overview

```
 [ User Browser ]
        │
        ▼
 [ Netlify CDN (Frontend) ]
        │ (proxies /api/* requests)
        ▼
 [ Render.com / Cloud Docker (Backend) ]
   ├── Node.js Express API
   ├── FFmpeg & ffprobe (video cropping, rendering)
   ├── yt-dlp (YouTube downloads & channel inspector)
   └── Background Queue & Schedulers
```

---

## Part 1: Deploy the Backend (Render.com — 100% Free)

Render provides free Docker hosting that automatically builds the included `backend/Dockerfile` with `ffmpeg` and `yt-dlp`.

### Step 1: Push Your Code to GitHub
1. Make sure your latest changes are pushed to your GitHub repository.

### Step 2: Create a Web Service on Render
1. Go to [https://dashboard.render.com](https://dashboard.render.com) and log in (or sign up for free).
2. Click **New +** $\rightarrow$ **Web Service**.
3. Choose **Build and deploy from a Git repository** and select your `clip-maker` repository.
4. Configure the settings:
   * **Name**: `clip-maker-backend`
   * **Language / Environment**: **Docker**
   * **Docker Context**: `backend`
   * **Dockerfile Path**: `backend/Dockerfile`
   * **Instance Type**: **Free**

### Step 3: Add Environment Variables in Render
In the **Environment Variables** section on Render, add:

| Key | Example / Description |
| :--- | :--- |
| `PORT` | `10000` (Render sets this automatically) |
| `LLM_PROVIDER` | `auto` |
| `GEMINI_API_KEY` | *(Your Google AI Studio API key)* |
| `ANTHROPIC_API_KEY` | *(Your Anthropic Claude API key, if using Claude)* |
| `YOUTUBE_CLIENT_ID` | `308073437930-...apps.googleusercontent.com` |
| `YOUTUBE_CLIENT_SECRET` | `GOCSPX-...` |
| `YOUTUBE_REDIRECT_URI` | `https://clip-maker-backend.onrender.com/api/youtube/oauth2callback` |
| `FRONTEND_URL` | `https://your-site.netlify.app` *(update after creating Netlify site)* |

### Step 4: Click "Create Web Service"
Render will build the Docker container (installing Node.js, FFmpeg, and yt-dlp) and start your server.
Once deployed, copy your live backend URL (e.g., `https://clip-maker-backend.onrender.com`).

---

## Part 2: Deploy the Frontend to Netlify

### Step 1: Connect Netlify to your GitHub Repo
1. Go to [https://app.netlify.com](https://app.netlify.com) and log in.
2. Click **Add new site** $\rightarrow$ **Import an existing project** $\rightarrow$ **GitHub**.
3. Select your `clip-maker` repository.

### Step 2: Configure Build Settings
Netlify will automatically detect the root `netlify.toml`. Verify the settings:
* **Base directory**: `frontend`
* **Build command**: `npm run build`
* **Publish directory**: `frontend/dist/clip-maker-frontend/browser`

### Step 3: Connect Frontend to Backend (Netlify Redirects)
Open `netlify.toml` in your repository and update the `/api/*` target URL with your Render backend URL:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://clip-maker-backend.onrender.com/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Commit and push this change to GitHub. Netlify will rebuild in seconds!

---

## Part 3: Update Google Cloud Console (YouTube OAuth)

To allow signing into your YouTube account from the deployed app:

1. Open [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Click on your **OAuth 2.0 Client ID**.
3. Under **Authorized JavaScript origins**, add:
   * `https://your-site.netlify.app`
4. Under **Authorized redirect URIs**, add:
   * `https://clip-maker-backend.onrender.com/api/youtube/oauth2callback`
5. Click **Save**.

---

## Alternative: Super-Fast Mac Cloudflare Tunnel (100% Free, 2-Minute Setup)

If you prefer to run the backend on your Mac (which encodes videos 10x faster using Apple Silicon hardware encoders and never goes to sleep):

1. Install Cloudflare tunnel:
   ```bash
   brew install cloudflared
   ```
2. Start the tunnel to your local backend:
   ```bash
   cloudflared tunnel --url http://localhost:4000
   ```
3. Copy the generated URL (e.g., `https://xxxx.trycloudflare.com`) and put it into `netlify.toml`:
   ```toml
   [[redirects]]
     from = "/api/*"
     to = "https://xxxx.trycloudflare.com/api/:splat"
     status = 200
     force = true
   ```
4. Now your Netlify frontend is instantly connected to your high-speed local engine!
