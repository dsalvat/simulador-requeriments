# Stage 1: Build
FROM mirror.gcr.io/library/node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM mirror.gcr.io/library/node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js .
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "server.js"]
