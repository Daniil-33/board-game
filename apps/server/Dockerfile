FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server
COPY apps/client/package.json ./apps/client/package.json
RUN pnpm install --frozen-lockfile
USER node
WORKDIR /app/apps/server
CMD ["node", "--import", "tsx", "src/main.ts"]
