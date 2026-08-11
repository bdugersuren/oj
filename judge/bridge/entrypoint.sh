#!/bin/bash
set -eu

export DMOJ_IN_DOCKER=1
export PYTHONUNBUFFERED=1
export LANG=C.UTF-8
export PYTHONIOENCODING=utf8
export HOME=/home/judge

# 1. Merge the autoconf runtimes with the mounted problem storage globs config
rm -f /tmp/merged_judge.yml
if [ -f /judge-runtime-paths.yml ]; then
    cat /judge-runtime-paths.yml > /tmp/merged_judge.yml
    if [ -f /judge/judge.yml ]; then
        echo "" >> /tmp/merged_judge.yml
        cat /judge/judge.yml >> /tmp/merged_judge.yml
    fi
else
    cp /judge/judge.yml /tmp/merged_judge.yml
fi
chown judge:judge /tmp/merged_judge.yml

# 2. Fix permission of the shared /problems directory for the sandbox user
chown -R judge:judge /problems || true
chmod -R 775 /problems || true

exec setpriv --reuid judge --regid judge --clear-groups /env/bin/python3 /app/bridge.py
