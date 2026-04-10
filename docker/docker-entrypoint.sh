#!/bin/sh
set -e

# Install root-level dependencies
npm install
pm2 update

# Build and optionally start the frontend app
npm install --prefix ./src/React
if [ "$APP_ENV" = "prod" ]; then
  npm run build --prefix ./src/React
  npm start --prefix ./src/React &
else
  npm run dev --prefix ./src/React &
fi

# Execute CMD from Dockerfile or docker-compose
exec "$@"
