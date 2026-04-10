FROM node:20 AS node_scapper

COPY --chown=node:node . /app
WORKDIR /app
COPY --link docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint

RUN chmod +x /usr/local/bin/docker-entrypoint && \
    apt update -y && \
    apt install -y libnss3-dev libgdk-pixbuf2.0-dev libgtk-3-dev libxss-dev libasound2 htop && \
    npm install pm2 -g && \
    pm2 update

USER root

RUN npm install && \
    npx puppeteer browsers install chrome

ENTRYPOINT ["docker-entrypoint"]
CMD npm start
