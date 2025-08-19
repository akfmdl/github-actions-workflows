#!/bin/sh

set -e

if [ "$1" = "django" ]; then
    cd /src; \
    exec /usr/local/bin/gunicorn perso_live_admin.wsgi:application \
        --worker-class=gevent \
        --worker-connections=1000 \
        --bind "0.0.0.0:8000" \
        --workers 4 \
        --timeout 90 \
        --access-logfile - \
        --error-logfile - \
        --log-level debug
elif [ "$1" = "celery" ]; then
    cd /src; exec /usr/local/bin/celery -A perso_live_admin worker --concurrency=30 --pool=gevent -l debug 
elif [ "$1" = "celery_beat" ]; then
    cd /src; exec /usr/local/bin/celery -A perso_live_admin beat -l debug -S django
else
    /bin/bash -c "$*"
fi
