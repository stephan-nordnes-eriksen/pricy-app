FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ripgrep curl ca-certificates procps \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code
USER node
WORKDIR /workspace
