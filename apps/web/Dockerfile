FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci

COPY . .
ARG API_URL=http://api:8080
ENV API_URL=$API_URL
RUN npm run build --workspace=apps/web

FROM node:20-alpine AS runner
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --omit=dev

COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/next.config.ts

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=apps/web", "--", "-H", "0.0.0.0", "-p", "3000"]
