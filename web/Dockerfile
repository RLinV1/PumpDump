# Runs the real server (server.mjs): mock/live API handling, header sanitising and the /api proxy.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Next bakes rewrites into the build, so the private API upstream must be set here.
ARG API_ORIGIN=http://api:8083
ENV API_ORIGIN=$API_ORIGIN
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The news, social sentiment and irony models (pinned revisions, quantized ONNX) are downloaded here, once,
# so the running container never needs the network for it. The script also runs one classification as a self-test.
ENV SENTIMENT_MODEL_DIR=/app/models
RUN node scripts/fetch-sentiment-model.mjs
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 SENTIMENT_MODEL_DIR=/app/models
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.mjs"]
