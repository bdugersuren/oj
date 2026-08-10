# Build a local DMOJ tier-3 judge image as documented by DMOJ. The public
# runtimes image only supplies language runtimes; it does not contain `dmoj`.
FROM dmoj/runtimes-tier3:latest

ARG DMOJ_REF=master

RUN mkdir /judge /problems /app && \
    chmod 1777 /problems && \
    cd /judge && \
    curl -fsSL "https://github.com/DMOJ/judge-server/archive/${DMOJ_REF}.tar.gz" | tar -xz --strip-components=1 && \
    python3 -m venv --prompt=DMOJ /env && \
    /env/bin/pip3 install --no-cache-dir cython setuptools && \
    /env/bin/pip3 install --no-cache-dir -e . && \
    /env/bin/python3 setup.py develop && \
    HOME=~judge . ~judge/.profile && \
    (runuser -u judge -w PATH -- /env/bin/dmoj-autoconf -V > /judge-runtime-paths.yml 2>/tmp/dmoj-autoconf.log || { tail -100 /tmp/dmoj-autoconf.log; exit 1; }) && \
    echo '  crt_x86_in_lib32: true' >> /judge-runtime-paths.yml

COPY bridge.py /app/bridge.py
COPY entrypoint.sh /judge/bridge-entrypoint
RUN chmod 755 /judge/bridge-entrypoint

EXPOSE 9999
ENTRYPOINT ["/usr/bin/tini", "--", "/judge/bridge-entrypoint"]
