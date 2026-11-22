# App Register container for Azure Container Apps (UAT).
# Start-up applies migrations (idempotent), then serves Next.js on port 3000.
FROM node:22-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["sh", "-c", "npm run db:migrate && npx next start -H 0.0.0.0 -p 3000"]
