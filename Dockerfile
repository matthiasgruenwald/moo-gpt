FROM node:lts-alpine
ENV NODE_ENV=production
# Install necessary packages
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set the environment variable to find Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
WORKDIR /usr/src/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install --production --silent && mv node_modules ../
COPY . .
EXPOSE 3000
VOLUME [ "/usr/src/app/public/storage" ]
VOLUME [ "/usr/src/app/config" ]
RUN chown -R node /usr/src/app
USER node
CMD ["npm", "start"]
