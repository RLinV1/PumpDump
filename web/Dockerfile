# Runs the real server (server.mjs): mock/live API handling, header sanitising and the /api proxy.
FROM node:20-alpine AS build
WORKDIR /app
# Next bakes rewrites into the build, so the private API upstream must be set here.
ARG API_ORIGIN=http://api:8083
ENV API_ORIGIN=$API_ORIGIN
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=20s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "server.mjs"]
