FROM --platform=linux/amd64 alpine:3.19

ENV TZ=Asia/Seoul

COPY ./container/docker-entrypoint.sh /

ENTRYPOINT [ "/bin/sh", "/docker-entrypoint.sh" ]
