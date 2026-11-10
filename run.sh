#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "         Starting SpatialMind Geospatial AI Platform       "
echo "=========================================================="

if ! docker info > /dev/null 2>&1; then
    echo "[!] Docker daemon is not running."
    echo "    Please start Docker Desktop and ensure the engine is active."
    exit 1
fi

echo "[1/2] Building and starting containerized services..."
docker compose up --build -d

echo "[2/2] SpatialMind services are now running!"
echo "----------------------------------------------------------"
echo "  Web Application (Frontend):  http://localhost:5173"
echo "  FastAPI Swagger Docs:        http://localhost:8000/docs"
echo "  FastAPI Healthcheck:         http://localhost:8000/health"
echo "  PostgreSQL PostGIS:          localhost:5432 (spatialdb)"
echo "  Redis:                       localhost:6379"
echo "----------------------------------------------------------"
echo ""
echo "To view logs: docker compose logs -f"
echo "To stop:      docker compose down"
