#!/bin/bash
set -e

mkdir -p log

if [ "$APP_ENV" == "prod" ]; then
  rm -rf build
  npx tsc # compiles Typescript files (.ts) into Javascript (.js) files, The output of these files is determined by the settings in your tsconfig.json
  pm2-runtime start ecosystem.config.js # use pm2-runtime to make it run in the foreground
else
  nodemon | tee "./log/dev/log $(date -d "today" +"%Y-%m-%d %H:%M").txt"
fi
