FROM node:18-bullseye-slim

# Install system dependencies: ffmpeg, python3, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install latest standalone yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Ensure runtime directories exist
RUN mkdir -p data downloads output

ENV PORT=4000
EXPOSE 4000

CMD ["node", "server.js"]
