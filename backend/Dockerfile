FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
COPY package.json ./
RUN bun install --production
COPY src ./src
COPY tsconfig.json ./
ENV PORT=4000
ENV VAULT_ROOT=/vault
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O- http://127.0.0.1:4000/api/health || exit 1
CMD ["bun", "src/index.ts"]
