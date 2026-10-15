FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=8787 DB_PATH=/data/mint-rush.db
VOLUME /data
EXPOSE 8787
CMD ["npm", "start"]
