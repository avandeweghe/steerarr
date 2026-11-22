# syntax=docker/dockerfile:1
# Steerarr production image: builds frontend and backend, then runs the backend as a
# non-root user, serving the API and the built app on one port.
#
#   docker build -t steerarr .
#   docker run -p 6232:6232 -v steerarr-data:/data steerarr

ARG NODE_IMAGE=node:26.13.1-alpine3.24

# --- Dependencies (all workspaces, including dev tools for the build) ----------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --no-audit --no-fund

# --- Build ---------------------------------------------------------------------------------
FROM deps AS build
COPY . .
# The app keeps the commit it was built from, to notice when the server has a newer one.
ARG STEERARR_COMMIT=
ENV VITE_STEERARR_COMMIT=$STEERARR_COMMIT
RUN npm run build

# --- Production dependencies of the backend only ------------------------------------------
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --workspace @steerarr/backend --no-audit --no-fund

# --- Runtime -------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=6232 \
    DATA_DIR=/data \
    STATIC_DIR=/app/public
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
# package.json carries "type": "module" for the compiled backend.
COPY --from=build /app/backend/package.json ./package.json
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/frontend/dist ./public

# The data folder must be writable by the runtime user (uid 1000) when it's a mounted volume.
RUN mkdir -p /data && chown node:node /data
USER node

# The commit the image was built from, shown under About (CI passes it; late, to keep the cache).
ARG STEERARR_COMMIT=
ENV STEERARR_COMMIT=$STEERARR_COMMIT

EXPOSE 6232
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 6232) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "dist/server.js"]
