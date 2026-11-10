# SpatialMind: Autonomous Chain-of-Thought Geospatial AI Platform

[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-PostGIS-336791.svg?logo=postgresql&logoColor=white)](https://postgis.net)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D.svg?logo=redis&logoColor=white)](https://redis.io)
[![Celery](https://img.shields.io/badge/Celery-Distributed_Tasks-37814A.svg?logo=celery&logoColor=white)](https://docs.celeryq.dev)

SpatialMind is an advanced geospatial intelligence system powered by a **Chain-of-Thought (CoT) Reactive AI Agent**. It allows analysts to upload spatial datasets (GeoJSON, Shapefile, KML, CSV, GeoTIFF), ingest them into a PostGIS spatial database, and run complex natural language queries that orchestrate spatial algorithms (buffering, spatial joins, elevation filtering, area calculations) in an iterative, reasoned loop.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Client ["Frontend Client (:5173)"]
        UI["React 18 + Leaflet Viewer"]
        WS["WebSocket Listener"]
    end

    subgraph API ["FastAPI Gateway (:8000)"]
        Server["Uvicorn Server"]
        WSManager["WebSocket Connection Hub"]
        TaskQueue["Task Dispatcher"]
    end

    subgraph Worker ["Celery Worker Tier"]
        Agent["Chain-of-Thought AI Agent"]
        GeoEngine["GeoPandas & Spatial Tools"]
    end

    subgraph Data ["Data & Messaging Tier"]
        PostGIS[("PostgreSQL 16 + PostGIS (:5432)")]
        RedisBroker[("Redis 7 Broker & Pub/Sub (:6379)")]
        DiskStorage[("Persistent Storage (Uploads & Results)")]
    end

    UI -->|HTTP Requests| Server
    WS <-->|WebSocket Stream /ws| WSManager
    Server --> PostGIS
    Server --> RedisBroker
    TaskQueue -->|Enqueue Job| RedisBroker
    RedisBroker -->|Consume Task| Agent
    Agent --> GeoEngine
    Agent -->|Query & Ingest| PostGIS
    GeoEngine <--> DiskStorage
    Agent -->|Publish Progress| RedisBroker
    RedisBroker -->|Pub/Sub Fanout| WSManager
```

---

## Key Capabilities

- **Autonomous Agent Reasoning**: Breaks user goals into sequential observations, goal critiques, and tool actions.
- **Geospatial Processing Engine**: Built-in tools for spatial filtering, multi-ring buffering, polygon intersections, spatial joins, attribute aggregation, and area calculation.
- **Real-Time Execution Telemetry**: Live streaming of agent thought chains and progress via WebSockets and Redis pub/sub.
- **Interactive Geospatial Visualization**: High-performance Leaflet mapping with dynamic GeoJSON layers, bounding box focusing, and popup feature inspection.
- **Production-Ready Containerization**: Docker Compose orchestration for PostGIS, Redis, FastAPI, Celery, and React.

---

## Getting Started: Docker Desktop (Recommended)

The easiest and most reliable way to run the entire SpatialMind platform is using Docker.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows, macOS, or Linux).

### 1. Launch Docker Desktop
Ensure Docker Desktop is open and the Docker engine status is **running**.

### 2. Configure Environment Variables
Copy `.env.example` to `.env` (already created by default):
```bash
cp .env.example .env
```
Ensure your `GOOGLE_API_KEY` is specified in `.env` if using Google Gemini.

### 3. Start All Services
On Windows (PowerShell):
```powershell
.\run.ps1
```
On Linux/macOS:
```bash
chmod +x run.sh
./run.sh
```
Or use standard Docker Compose commands:
```bash
docker compose up --build -d
```

### 4. Service Endpoints

| Service | URL | Description |
| :--- | :--- | :--- |
| **Frontend Web UI** | [http://localhost:5173](http://localhost:5173) | Interactive Map, Chat & Upload Interface |
| **FastAPI Swagger Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Interactive OpenAPI documentation |
| **Backend Health Check** | [http://localhost:8000/health](http://localhost:8000/health) | API health check endpoint |
| **PostgreSQL + PostGIS** | `localhost:5432` | Database: `spatialdb`, User: `postgres` |
| **Redis Broker** | `localhost:6379` | Message broker and pub/sub cache |

To view real-time logs:
```bash
docker compose logs -f
```

To stop all services:
```bash
docker compose down
```

---

## Local Development (Without Docker)

### 1. Backend Setup
```bash
cd SpatialMind-backend

# 1. Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows
# source .venv/bin/activate    # Linux/macOS

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start Redis & PostgreSQL with PostGIS
# Ensure PostgreSQL is running on port 5432 and Redis on 6379

# 4. Start Celery worker in one terminal
celery -A app.core.celery_app.celery_app worker -l info -Q celery

# 5. Start FastAPI server in another terminal
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend Setup
```bash
cd SpatialMind-frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```
The frontend will be available at [http://localhost:5173](http://localhost:5173).

---

## Test Datasets & Sample Queries

The repository includes curated test datasets in the root directory:

| Dataset | Format | Description |
| :--- | :--- | :--- |
| `test_flood_areas_delhi.geojson` | GeoJSON | 15 flood zones, monitoring stations, and elevation data for Delhi. |
| `test_urban_areas_delhi.geojson` | GeoJSON | 8 urban boundaries with population density and district metadata. |
| `india_state.geojson` | GeoJSON | Administrative state boundaries of India. |
| `india_district.geojson` | GeoJSON | District level boundaries of India. |

### Sample Analysis Queries
1. **Flood Vulnerability Analysis**:
   > *"Show me flood prone areas in Delhi with elevation below 210 meters."*
2. **Buffer & Proximity Analysis**:
   > *"Create a 500-meter buffer around flood zones and identify intersecting urban areas."*
3. **Demographic & Density Analysis**:
   > *"Highlight urban areas with a population density above 20,000 per sq km."*

---

## Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://postgres:postgres@db:5432/spatialdb` | SQLAlchemy connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Redis URL for broker and pub/sub |
| `CELERY_BROKER_URL` | Inherits `REDIS_URL` | Celery broker address |
| `CELERY_RESULT_BACKEND` | Inherits `REDIS_URL` | Celery results backend |
| `UPLOAD_DIR` | `/app/uploads` | Directory for uploaded datasets |
| `RESULT_DIR` | `/app/results` | Directory for generated job results |
| `GOOGLE_API_KEY` | *(optional)* | Google Gemini API key for agent reasoning |
| `VITE_API_URL` | `http://localhost:8000` | Backend API base URL for the frontend |

---

## Repository Structure

```
COT-Geospatial/
├── SpatialMind-backend/           # FastAPI backend
│   ├── app/
│   │   ├── api/                 # REST endpoints (datasets, layers, query, upload)
│   │   ├── core/                # Config, Celery, Redis & WebSocket managers
│   │   ├── llm/                 # CoT agent, RAG retriever & prompt templates
│   │   ├── models/              # SQLAlchemy & GeoAlchemy2 models
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── services/            # Geoprocessing & file handling services
│   │   ├── sockets/             # WebSocket route endpoints
│   │   ├── tasks/               # Celery asynchronous tasks
│   │   └── utils/               # Geospatial computation utilities
│   ├── migrations/              # Alembic database migration scripts
│   └── Dockerfile               # Backend container definition
├── SpatialMind-frontend/          # React 18 + Vite frontend
│   ├── src/
│   │   ├── api/                 # Axios API clients
│   │   ├── components/          # MapViewer, ChatWindow, LayerControls
│   │   ├── hooks/               # Application context & actions
│   │   ├── socket/              # WebSocket client service
│   │   └── store/               # Reducers & state definitions
│   ├── nginx.conf               # Production Nginx reverse proxy configuration
│   ├── vite.config.js           # Vite development server configuration
│   └── Dockerfile               # Multi-stage frontend container
├── docker/
│   └── init-db/                 # PostGIS SQL initialization
├── docker-compose.yml           # Multi-container orchestration
├── run.ps1                      # Windows PowerShell startup script
├── run.sh                       # Linux/macOS startup script
├── .env.example                 # Sample environment configuration
└── README.md                    # Project documentation
```

---

## Free Cloud Deployment Guide

You can deploy the complete SpatialMind stack (Frontend, Backend, PostGIS Database, and Redis) 100% free using the following verified architecture:

### 1. Database: Supabase (Free PostgreSQL + PostGIS)
1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **Database** -> **Extensions** -> Search for `postgis` and toggle it **ON**.
3. Under **Project Settings** -> **Database**, copy your **Connection URI**:
   ```env
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```

### 2. Cache: Upstash Redis (Free Serverless Redis)
1. Create a free Redis database at [upstash.com](https://upstash.com).
2. Copy the `rediss://...` connection URL into your backend environment:
   ```env
   REDIS_URL=rediss://default:[YOUR-PASSWORD]@[ENDPOINT].upstash.io:6379
   ```

### 3. Backend: Render.com (Free Web Service with Docker)
1. Push your repository to GitHub.
2. Sign in to [render.com](https://render.com) and click **New +** -> **Web Service**.
3. Select your repository `COT-Geospatial`.
4. Choose **Docker** as the runtime:
   - Root Directory: `SpatialMind-backend`
   - Dockerfile Path: `SpatialMind-backend/Dockerfile`
   - Instance Type: **Free**
5. Under **Environment Variables**, add:
   - `DATABASE_URL` = your Supabase connection string
   - `REDIS_URL` = your Upstash Redis URL
   - `LLM_PROVIDER` = `gemini` (or `groq`)
   - `GOOGLE_API_KEY` = your Google AI Studio API key
   - `GROQ_API_KEY` = your Groq API key
6. Click **Create Web Service**. Render will deploy your container and provide a live URL (e.g. `https://spatialmind-backend.onrender.com`).

### 4. Frontend: Vercel (Free Static SPA Hosting)
1. Sign in to [vercel.com](https://vercel.com) and click **Add New** -> **Project**.
2. Import your GitHub repository `COT-Geospatial`.
3. Configure the project settings:
   - Framework Preset: **Vite**
   - Root Directory: `SpatialMind-frontend`
4. Under **Environment Variables**, add:
   - `VITE_API_URL` = `https://spatialmind-backend.onrender.com`
   - `VITE_WS_URL` = `wss://spatialmind-backend.onrender.com/ws`
5. Click **Deploy**. Vercel will build and host your frontend globally with instant SSL.

---

## License

This project is licensed under the MIT License.
