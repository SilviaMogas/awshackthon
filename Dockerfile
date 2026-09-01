# Health Response Agent — production container.
# Multi-stage: build with devDependencies (TypeScript), run with a slim image.
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies (TypeScript is the only devDependency).
COPY package.json package-lock.json ./
RUN npm ci

# Compile server + client and copy static assets into dist/.
COPY tsconfig.base.json tsconfig.server.json tsconfig.client.json tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

# ---- Runtime image (no dependencies needed at runtime) ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Only the compiled output and package.json are required to run.
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 3000
CMD ["node", "dist/server/index.js"]
