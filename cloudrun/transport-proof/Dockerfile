FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server-r4.js ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm","start"]
