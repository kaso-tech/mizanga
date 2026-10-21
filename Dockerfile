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

RUN addgroup -S gilli && adduser -S -G gilli gilli

COPY --from=build --chown=gilli:gilli /app/dist ./dist
COPY --from=build --chown=gilli:gilli /app/server ./server

USER gilli
EXPOSE 3000

CMD ["node", "server/index.mjs"]
