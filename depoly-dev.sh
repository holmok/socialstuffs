#!/usr/bin/env bash
set -euo pipefail

REPO="us-central1-docker.pkg.dev/socialstuffs/dev-website"
IMAGE="${REPO}/socialstuffs"
TAG="$(date +%Y%m%d-%H%M%S)"

# Make sure docker can authenticate to the Artifact Registry host
gcloud auth configure-docker us-central1-docker.pkg.dev --quiet

# Build for Intel/x86 (linux/amd64) and push both tags
docker buildx build --platform linux/amd64 -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" --push .

echo "Pushed ${IMAGE}:${TAG} and ${IMAGE}:latest, now deploying to Cloud Run."

gcloud run deploy dev-website-run \
  --image us-central1-docker.pkg.dev/socialstuffs/dev-website/socialstuffs:latest \
  --region us-central1 \
  --project socialstuffs