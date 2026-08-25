# Build a local DMOJ tier-3 judge image as documented by DMOJ. The public
# runtimes image only supplies language runtimes; it does not contain `dmoj`.
FROM dmoj/runtimes-tier3@sha256:1bed38136cd7dacc2a60cbc2a380d057ed9c5aea46bd866c6e6ab2bfb3a35838

# Install a reviewed testlib release globally for custom checkers.
ARG TESTLIB_REF=0.9.41
RUN curl -fsSL "https://raw.githubusercontent.com/MikeMirzayanov/testlib/${TESTLIB_REF}/testlib.h" -o /usr/include/testlib.h

ARG DMOJ_REF=v5.0.0

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
