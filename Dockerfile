FROM node:20-slim AS build
WORKDIR /app
# playwright is for the tests; nothing in the image runs a browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/src ./src
COPY --from=build /app/dist ./dist
EXPOSE 2567
CMD ["node", "src/server/index.js"]
