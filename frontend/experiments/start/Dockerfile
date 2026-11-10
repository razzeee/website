FROM node:24.22.0-slim

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_OPTIONS=--max-old-space-size=2048

WORKDIR /app
COPY --chown=node:node .output/ ./
USER node
EXPOSE 3000
CMD ["node", "--import", "./server/instrument.server.mjs", "server/index.mjs"]
