ARG BASE_IMAGE=mcr.microsoft.com/devcontainers/base:trixie

FROM $BASE_IMAGE

USER root

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcairo2 \
    libgtk-3-0 \
    libgbm1 \
    libasound2t64 \
    xvfb \
    xauth \
    && apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

USER vscode
