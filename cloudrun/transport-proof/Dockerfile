FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY assignment-validation-v211.js ./
COPY actor-capabilities-v211.js ./
COPY scope-hours-version-20.js ./
COPY scope-policy-20.js ./
COPY scope-scheme-version-20.js ./
COPY scope-create-20.js ./
COPY company-scope-hours-storage-20.js ./
COPY company-scope-hours-migration-20.js ./
COPY company-scope-hours-backfill-20.js ./
COPY company-scope-hours-resolver-20.js ./
COPY company-management-readmodel-20.js ./
COPY company-auditor-permissions-20.js ./
COPY auditor-identity-versions.js ./
COPY auditor-uid-backfill-preview.js ./
COPY rotation-*.cjs ./
COPY rotation-manager-20.mjs ./
COPY rotation-manager-20.html ./
COPY rotation-manager-20.js ./
COPY auth-session-policy.mjs ./
COPY auth-session-revocation-20.js ./
COPY auth-fast-otp-20.mjs ./
COPY manager-canonical-write-bridge-20.mjs ./
COPY combined-visit-*.mjs ./
COPY server-r4.js ./
COPY server-r5.js ./
COPY server-r6.js ./
COPY server-r7.js ./
COPY server-r8.js ./
COPY server-r9.js ./
COPY server-r10.js ./
COPY server-r11.js ./
COPY server-r12.js ./
COPY notification-overview-20.mjs ./
COPY notification-manager-20.html ./
COPY runtime-environment-20.mjs ./
COPY swap-*.mjs ./
COPY server-r15.js ./
COPY availability-*.js ./
COPY availability-manager-calendar-20.html ./
COPY availability-my-calendar-20.html ./
COPY scheduling-delta-test.mjs ./
COPY manager-portal.html ./
COPY manager-portal.js ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm","start"]
