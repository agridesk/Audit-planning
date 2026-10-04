FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY assignment-validation-v211.js ./
COPY actor-capabilities-v211.js ./
COPY server-r4.js ./
COPY server-r5.js ./
COPY server-r6.js ./
COPY server-r7.js ./
COPY server-r8.js ./
COPY server-r9.js ./
COPY server-r10.js ./
COPY server-r11.js ./
COPY server-r12.js ./
COPY scheduling-delta-test.mjs ./
COPY manager-portal.html ./
COPY manager-portal.js ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm","start"]
