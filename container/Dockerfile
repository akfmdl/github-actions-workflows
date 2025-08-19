FROM --platform=linux/amd64 python:3.12.2-bookworm as build

RUN --mount=type=cache,target=/tmp/pip \
    curl -sSL https://install.python-poetry.org | \
    PIP_CACHE_DIR=/tmp/pip \
    POETRY_VERSION=1.8.2 \
    POETRY_HOME=/opt/poetry \
    python3 - && \
    /opt/poetry/bin/poetry self add "poetry-dynamic-versioning[plugin]==1.2.0" && \
    /opt/poetry/bin/poetry self add "poetry-plugin-export==1.8.0"


FROM --platform=linux/amd64 python:3.12.2-slim-bookworm@sha256:5dc6f84b5e97bfb0c90abfb7c55f3cacc2cb6687c8f920b64a833a2219875997

ENV TZ=Asia/Seoul \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt update && apt install -y --no-install-recommends \
    ffmpeg=7:5.1.6-0+deb12u1 \
    && rm -rf /var/lib/apt/lists/*

COPY ./container/docker-entrypoint.sh /

COPY ./container/mime/custom_mime.types /etc/custom_mime.types

ENTRYPOINT [ "/bin/sh", "/docker-entrypoint.sh" ]
