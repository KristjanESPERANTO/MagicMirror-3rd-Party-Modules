FROM node:24-slim AS builder

RUN apt-get update \
	&& apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

COPY . .

ARG GITHUB_TOKEN WIKI_FILE
RUN <<EOF
set -e
git config --global --add safe.directory /workspace
git log -1
export GITHUB_TOKEN="${GITHUB_TOKEN}"
npm clean-install
node --run all
EOF

FROM nginxinc/nginx-unprivileged:alpine-slim
LABEL maintainer="MagicMirrorOrg"

COPY container/default.conf /etc/nginx/conf.d/
COPY container/nginx.conf /etc/nginx/

COPY --from=builder /workspace/website /usr/share/nginx/website/

EXPOSE 8080
