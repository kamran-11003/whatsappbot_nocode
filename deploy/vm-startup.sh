#!/usr/bin/env bash
# startup script for the wm-data VM
# Runs MongoDB, Redis, and RabbitMQ in Docker containers
set -e

# Install Docker
apt-get update -qq
apt-get install -y -qq docker.io
systemctl enable --now docker

# Persistent data directories (backed by the attached persistent disk at /data)
mkdir -p /data/mongo /data/redis /data/rabbitmq

# MongoDB
docker run -d --name mongo --restart=always \
  -p 27017:27017 \
  -v /data/mongo:/data/db \
  mongo:7 --wiredTigerCacheSizeGB 1

# Redis (with AOF persistence)
docker run -d --name redis --restart=always \
  -p 6379:6379 \
  -v /data/redis:/data \
  redis:7-alpine redis-server --appendonly yes

# RabbitMQ
docker run -d --name rabbitmq --restart=always \
  -p 5672:5672 \
  -e RABBITMQ_DEFAULT_USER=wm \
  -e RABBITMQ_DEFAULT_PASS=RABBITMQ_PASSWORD_PLACEHOLDER \
  -v /data/rabbitmq:/var/lib/rabbitmq \
  rabbitmq:3-alpine
