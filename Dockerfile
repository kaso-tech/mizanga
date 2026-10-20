FROM node:22-alpine AS build

WORKDIR /app
ENV CI=true

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . ./
RUN pnpm build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S mizanga && adduser -S -G mizanga mizanga

COPY --from=build --chown=mizanga:mizanga /app/dist ./dist
COPY --from=build --chown=mizanga:mizanga /app/server ./server

USER mizanga
EXPOSE 3000

CMD ["node", "server/index.mjs"]
