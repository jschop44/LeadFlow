FROM node:22-bookworm-slim
ARG APP_COMMIT_SHA=unversioned
ENV NODE_ENV=production APP_COMMIT_SHA=$APP_COMMIT_SHA PORT=10000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node backend ./backend
COPY --chown=node:node index.html ./index.html
USER node
EXPOSE 10000
CMD ["node","backend/server.js"]
