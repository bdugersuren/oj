#!/bin/bash
set -eu

export DMOJ_IN_DOCKER=1
export PYTHONUNBUFFERED=1
export LANG=C.UTF-8
export PYTHONIOENCODING=utf8
export HOME=/home/judge

exec setpriv --reuid judge --regid judge --clear-groups /env/bin/python3 /app/bridge.py
