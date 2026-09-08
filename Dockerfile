# pet-care-tracker — one process serving both the API and the built front end.
#
# The application runs its TypeScript through `tsx` rather than compiling to JavaScript:
# the workspace uses extensionless imports and project references, which plain Node cannot
# resolve from emitted output. That keeps the dev dependencies in the image, which is the
# honest cost of the arrangement.
FROM node:22-slim

WORKDIR /app

# Playwright is a dev dependency of the front end and its postinstall would otherwise pull
# a browser into the image. Nothing here drives a browser.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Manifests first, so a source change does not reinstall the world.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/catalog/package.json packages/catalog/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

# better-sqlite3, sharp and @node-rs/argon2 all ship prebuilt binaries for linux-x64, so
# no compiler is needed.
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    WEB_DIST=/app/apps/web/dist

EXPOSE 8080

CMD ["npx", "tsx", "apps/api/src/index.ts"]
