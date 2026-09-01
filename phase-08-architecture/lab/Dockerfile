FROM node:24-alpine

WORKDIR /srv

# Dependencies first so editing the script does not re-run npm install.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# You choose a script per run; `docker compose run` overrides this anyway.
CMD ["node", "--version"]
