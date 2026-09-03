FROM node:20-slim AS deps
WORKDIR /app
COPY package.json ./
RUN corepack enable && npm install

FROM node:20-slim AS dev
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
