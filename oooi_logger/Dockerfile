FROM python:3.12-alpine
RUN apk add --no-cache tzdata
COPY rootfs/app /app
WORKDIR /app
CMD ["python3", "-u", "/app/server.py"]
