FROM oven/bun:1-slim

RUN apt-get update && apt-get install -y \
    ffmpeg ca-certificates \
    fonts-liberation libatk-bridge2.0-0 libatk1.0-0 \
    libcairo2 libcups2 libdbus-1-3 libexpat1 libgbm1 \
    libglib2.0-0 libgtk-3-0 libnspr4 libnss3 \
    libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 \
    libxcomposite1 libxdamage1 libxext6 libxfixes3 \
    libxi6 libxrandr2 libxss1 libxtst6 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json .
RUN bun install
COPY server.js .

EXPOSE 8080
CMD ["bun", "server.js"]
