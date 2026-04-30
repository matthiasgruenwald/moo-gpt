FROM node:22-bookworm

# Set environment to production
ENV NODE_ENV=production

# Install system dependencies: Chrome (Puppeteer) + build tools (better-sqlite3)
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxcomposite1 \
    libxrandr2 \
    libxdamage1 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxss1 \
    build-essential \
    python3 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Set custom Puppeteer cache directory
ENV PUPPETEER_CACHE_DIR=/usr/src/app/.cache/puppeteer

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or npm-shrinkwrap.json)
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]

# Install dependencies
RUN npm install --production --silent

# Install the necessary Chrome version for Puppeteer
RUN npx puppeteer browsers install chrome \
    && ls -al /usr/src/app/.cache/puppeteer

# Copy the rest of the application code
COPY . .

# Expose the application port
EXPOSE 3000

# Define volumes (consolidated)
# chats.db: SQLite-Datenbank für Thread- und Nachrichten-Logging (Issue #2)
VOLUME ["/usr/src/app/public/storage", "/usr/src/app/config", "/usr/src/app/chats.db"]

# Ensure the node user has appropriate permissions
RUN chown -R node:node /usr/src/app

# Switch to the node user
USER node

# Define the command to start your application
CMD ["npm", "start"]
