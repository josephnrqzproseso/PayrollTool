FROM node:20-slim AS base
WORKDIR /app

COPY worker/package.json worker/package-lock.json* ./worker/
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN cd worker && npm ci --omit=dev
RUN npx prisma generate

COPY worker ./worker
COPY src ./src

ENV NODE_ENV=production
EXPOSE 8081
CMD ["node", "--import", "tsx", "worker/src/index.ts"]
