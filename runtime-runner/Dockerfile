FROM node:22-slim

WORKDIR /app

COPY package.json ./
COPY server.mjs ./

EXPOSE 8080

CMD ["node", "server.mjs"]
