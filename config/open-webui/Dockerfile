FROM ghcr.io/open-webui/open-webui:v0.9.5@sha256:e045bde3b004cc7f8c319412345eb56c87ea6ac57031534a31ca37ad5424beb3

COPY entrypoint.sh /usr/local/bin/oj-open-webui-entrypoint
RUN chmod 0555 /usr/local/bin/oj-open-webui-entrypoint

ENTRYPOINT ["/usr/local/bin/oj-open-webui-entrypoint"]
