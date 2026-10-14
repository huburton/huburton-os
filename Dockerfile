# ====== Stage 1: build the static front with Bun ======
FROM oven/bun:1.3.14-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
COPY backend/package.json ./backend/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ====== Stage 2: nginx serves the static files and proxies /api to the Bun API ======
FROM nginx:1.29-alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O- http://127.0.0.1/ || exit 1
