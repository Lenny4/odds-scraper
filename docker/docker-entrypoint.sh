#!/bin/sh
set -e

# Install root-level dependencies
npm install
pm2 update

# Build and optionally start the frontend app
npm install --prefix ./src/Front/React
if [ "$APP_ENV" = "prod" ]; then
  npm run build --prefix ./src/Front/React
  npm start --prefix ./src/Front/React &
else
  npm run dev --prefix ./src/Front/React &
fi

# Execute CMD from Dockerfile or docker-compose
exec "$@"
