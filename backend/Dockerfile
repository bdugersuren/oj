FROM python:3.12-slim@sha256:7a8b475003c4fe15a2cd4e55e5cfc2f3560bdc9333d624f24cdd6d4340fd7a17

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

ARG TESTLIB_REF=0.9.41
RUN curl -fsSL "https://raw.githubusercontent.com/MikeMirzayanov/testlib/${TESTLIB_REF}/testlib.h" -o /usr/include/testlib.h

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Match the numeric UID/GID of the DMOJ `judge` user so the Celery worker can
# read/write the shared problems volume without running the API or worker as
# root. No privileged operation is performed after this boundary.
RUN groupadd --gid 1000 oj && \
    useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin oj && \
    mkdir -p /problems && \
    chown -R oj:oj /app /problems

USER oj:oj

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
