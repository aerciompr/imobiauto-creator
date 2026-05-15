FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund --loglevel=error
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund --loglevel=error
COPY --from=builder /app/dist ./dist
COPY server ./server
ENV PORT=80
EXPOSE 80
CMD ["npm", "start"]
