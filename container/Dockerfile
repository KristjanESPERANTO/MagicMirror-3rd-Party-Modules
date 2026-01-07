FROM node:lts AS builder

WORKDIR /workspace

COPY . .

ARG GITHUB_TOKEN WIKI_FILE

# Install GitHub CLI and gh-slimify extension
RUN <<EOF
set -e
apt-get update
apt-get install -y curl
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get update
apt-get install -y gh
gh extension install fchimpan/gh-slimify
apt-get clean
rm -rf /var/lib/apt/lists/*
EOF

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

HEALTHCHECK --timeout=10s --start-period=60s CMD wget -qO /dev/null http://0.0.0.0:8080
