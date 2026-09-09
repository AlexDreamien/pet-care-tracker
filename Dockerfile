# pet-care-tracker — one process serving both the API and the built front end.
#
# Two stages. The builder compiles the API into a single JavaScript file and builds the
# front end; the runtime carries neither TypeScript nor a bundler, only the production
# dependencies and the two build outputs.
#
# This used to be one stage that started the server with `npx tsx apps/api/src/index.ts`,
# stripping types on every boot. On a shared vCPU that took minutes, and the instance
# answered 502 the whole time without logging a line — it looked exactly like a crash.

FROM node:22-slim AS builder

WORKDIR /app

# Playwright is a dev dependency of the front end and its postinstall would otherwise pull a
# browser into the image. Nothing here drives a browser.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Manifests first, so a source change does not reinstall the world.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/catalog/package.json packages/catalog/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci

COPY . .
RUN npm run build


FROM node:22-slim AS runtime

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/catalog/package.json packages/catalog/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# better-sqlite3, sharp and @node-rs/argon2 all ship prebuilt binaries for linux-x64, so no
# compiler is needed. The workspace packages are already inside the bundle; npm still wants
# their manifests to satisfy the lockfile, which is why they are copied above.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/apps/api/build apps/api/build
COPY --from=builder /app/apps/web/dist apps/web/dist

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    WEB_DIST=/app/apps/web/dist

EXPOSE 8080

# --enable-source-maps: a stack trace out of a bundle is unreadable without it.
CMD ["node", "--enable-source-maps", "apps/api/build/server.js"]
