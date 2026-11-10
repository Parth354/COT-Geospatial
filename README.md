# SpatialMind: Autonomous Chain-of-Thought Geospatial Intelligence Platform

[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900.svg?logo=leaflet&logoColor=white)](https://leafletjs.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-PostGIS-336791.svg?logo=postgresql&logoColor=white)](https://postgis.net)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D.svg?logo=redis&logoColor=white)](https://redis.io)
[![Celery](https://img.shields.io/badge/Celery-Distributed_Tasks-37814A.svg?logo=celery&logoColor=white)](https://docs.celeryq.dev)

SpatialMind is an enterprise-grade geospatial artificial intelligence platform powered by an autonomous **Chain-of-Thought (CoT) Reactive Agent**. It enables geospatial analysts, emergency planners, and data scientists to upload vector and raster datasets (GeoJSON, Shapefile, KML, CSV, GeoTIFF), connect real-time external data APIs, and run complex natural language inquiries that orchestrate deterministic spatial algorithms (multi-ring buffering, polygon intersections, topological joins, elevation filtering, and density aggregation) in an iterative, verified reasoning loop.

---

## Architectural Architecture

```mermaid
flowchart TD
    subgraph Client ["Frontend Client (:5173)"]
        UI["React 18 SPA + Multi-Basemap Leaflet"]
        HUD["Live Cursor & Scale HUD (EPSG:4326)"]
        Settings["Settings: LLMs, APIs & MCP Panel"]
        WS["WebSocket Telemetry Listener"]
    end

    subgraph API ["FastAPI Gateway (:8000)"]
        Server["Uvicorn Async Gateway"]
        WSManager["WebSocket Connection Hub"]
        TaskQueue["Task Dispatcher & Job Monitor"]
        SettingsRoutes["Key & Custom API Manager"]
    end

    subgraph Worker ["Celery Distributed Worker Tier"]
        Agent["Chain-of-Thought Reactive AI Agent"]
        ToolRegistry["39+ Built-In & Dynamic Spatial Tools"]
        GeoEngine["GeoPandas & PostGIS Geometry Processor"]
    end

    subgraph External ["External Intelligence & Telemetry"]
        LLM["AI Providers: Anthropic Claude / Gemini / Groq / OpenAI"]
        APIs["Standard Feeds: NASA FIRMS / OpenAQ / Mapbox / OpenWeather"]
        CustomFeeds["Custom Data APIs (GeoJSON / Coordinate Arrays / Rasters)"]
        MCPServers["Model Context Protocol (MCP) Remote Servers"]
    end

    subgraph Storage ["Persistent Infrastructure"]
        PostGIS[("PostgreSQL 16 + PostGIS (:5432)")]
        RedisBroker[("Redis 7 Pub/Sub & Task Queue (:6379)")]
        DiskStorage[("Persistent Storage (Uploads & Results)")]
    end

    UI -->|HTTP REST| Server
    WS <-->|WebSocket Stream /ws| WSManager
    Server --> PostGIS
    Server --> RedisBroker
    TaskQueue -->|Enqueue Job| RedisBroker
    RedisBroker -->|Consume Task| Agent
    Agent <-->|Inference| LLM
    Agent --> ToolRegistry
    ToolRegistry <-->|Telemetry Queries| APIs
    ToolRegistry <-->|Dynamic Integration| CustomFeeds
    ToolRegistry <-->|Standard Protocols| MCPServers
    ToolRegistry --> GeoEngine
    GeoEngine <-->|Spatial Query & Ingestion| PostGIS
    GeoEngine <--> DiskStorage
    Agent -->|Publish Progress Steps| RedisBroker
    RedisBroker -->|Pub/Sub Fanout| WSManager
```

---

## Core Capabilities

### 1. Multi-Provider AI Inference & Dynamic Model Selection
SpatialMind supports plug-and-play LLM providers with full model customization:
- **Anthropic Claude**: `claude-3-7-sonnet-latest` (Frontier hybrid reasoning), `claude-3-5-sonnet-latest`, `claude-3-5-haiku-latest`, `claude-3-opus-latest`.
- **Google Gemini**: `gemini-2.0-flash` (Free tier multimodal), `gemini-1.5-flash` (Resilient, high rate limits), `gemini-1.5-pro`.
- **Groq Cloud**: `llama-3.3-70b-versatile` (Ultra-low latency open weights), `deepseek-r1-distill-llama-70b`, `llama-3.1-8b-instant`.
- **OpenAI Platform**: `gpt-4o`, `gpt-4o-mini`, `o3-mini`, `o1`.
- **Custom Model ID Override**: Ability to enter custom fine-tuned model identifiers for any supported provider directly in the Settings modal.

### 2. Universal Custom Data API Integration
Connect any RESTful data endpoint into the AI agent's execution loop without writing Python code:
- **Specification Engine**: Accepts any public or authenticated HTTP GET/POST endpoint.
- **Accepted Formats**:
  1. `geojson_feature_collection`: Standard GeoJSON with FeatureCollection geometry.
  2. `record_array`: JSON array of objects containing latitude/longitude coordinates (e.g. `[{"lat": 28.61, "lon": 77.20, "magnitude": 4.5}]`).
  3. `geotiff_reference`: JSON payload containing downloadable GeoTIFF raster links.
- **Dynamic Tool Registration**: Each enabled custom feed is dynamically registered as a dedicated agent tool (e.g., `fetch_custom_usgs_seismic_feed`), allowing the agent to fetch, validate, transform into GeoPandas GeoDataFrames, and render live layers seamlessly.

### 3. Upgraded Enterprise Leaflet Geospatial Viewer
- **Multi-Basemap Switching**:
  - *CartoDB Positron*: Ultra-clean light cartography for feature highlighting.
  - *ESRI World Imagery*: Sub-meter high-resolution satellite imagery.
  - *CartoDB Dark Matter*: Dark tactical backdrop for high-contrast night/thermal visualizations.
  - *OpenStreetMap Standard*: Canonical global open geographic reference.
  - *OpenTopoMap*: Elevation contour lines and physical terrain visualization.
- **Head-Up Display (HUD)**: Real-time cursor coordinates (`Lat: 28.6139°N | Lon: 77.2090°E`) with zoom scale and spatial reference system tag (`EPSG:4326`).
- **Extent Fitting**: One-click "Fit All Layers" button automatically unions active bounding boxes and frames the viewport.
- **Attribute-Driven Feature Styling**: Dynamic color ramps, stroke weights, and circle markers proportional to attribute telemetry (e.g., AQI, Fire Radiative Power in MW, Earthquake Magnitude).

### 4. Deterministic Geospatial Processing Engine
The agent utilizes over 39 deterministic tools built on **GeoPandas**, **Shapely**, **PyProj**, **Rasterio**, and **PostGIS**:
- Spatial buffering with metric geodesic projection conversion (UTM/EPSG:3857).
- Geometric intersections, difference masks, and spatial containment joins.
- Elevation extraction from Copernicus 30m DEM rasters.
- Isochrone driving/walking catchment generation via Mapbox API.
- Satellite thermal hotspot detection via NASA FIRMS VIIRS/MODIS feeds.
- Air quality telemetry monitoring via OpenAQ global stations.

---

## Getting Started: Docker Compose (Recommended)

The quickest and most reliable deployment for local evaluation:

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Provide your chosen AI provider key (e.g. `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, or `GROQ_API_KEY`) in `.env`, or configure it directly via the in-app Settings modal at runtime.

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
Or via standard Docker Compose:
```bash
docker compose up --build -d
```

### 4. Service Endpoints

| Service | Endpoint | Description |
| :--- | :--- | :--- |
| **Frontend Web Console** | [http://localhost:5173](http://localhost:5173) | Interactive Leaflet Map, Chat Console & Settings |
| **FastAPI Swagger Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Interactive OpenAPI documentation |
| **Health Check** | [http://localhost:8000/health](http://localhost:8000/health) | API Gateway operational status |
| **PostgreSQL + PostGIS** | `localhost:5432` | Database: `spatialdb`, User: `postgres` |
| **Redis Queue & Pub/Sub** | `localhost:6379` | Task broker and telemetry distribution |

---

## Local Development (Without Docker)

### 1. Backend Setup
```bash
cd SpatialMind-backend

# 1. Create and activate a Python virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows PowerShell
# source .venv/bin/activate    # Linux/macOS

# 2. Install dependencies
pip install -r requirements.txt

# 3. Ensure local PostgreSQL (with PostGIS) is running on :5432 and Redis on :6379

# 4. Start Celery worker in Terminal 1
celery -A app.core.celery_app.celery_app worker -l info -Q celery

# 5. Start FastAPI application in Terminal 2
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend Setup
```bash
cd SpatialMind-frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```
Access the application at [http://localhost:5173](http://localhost:5173).

---

## Sample Geospatial Inquiries & Scenarios

SpatialMind executes end-to-end spatial logic from high-level operational inquiries:

1. **Flood Hazard & Settlement Vulnerability**:
   > *"Identify all residential settlement zones that intersect active flood inundation zones with an elevation below 215 meters."*
   - Agent downloads elevation rasters, clips to boundary, filters contour elevations, buffers flood perimeters, and intersects settlement polygons.

2. **Thermal Hotspot & Fire Radiative Power Impact**:
   > *"Query NASA FIRMS satellite telemetry for active thermal anomalies over the last 24 hours, filter for detections with FRP above 50 MW, and compute a 3 km hazard buffer zone."*
   - Agent calls `fetch_nasa_firms_hotspots`, creates geodesic metric buffers, and computes endangered land area in square kilometers.

3. **Seismic Activity & Proximity Analysis**:
   > *"Fetch real-time earthquake feeds from the USGS Custom API, isolate events with magnitude 4.5 or greater, and calculate proximity to major population centers."*
   - Agent invokes `fetch_custom_usgs_seismic_feed`, converts coordinate records into spatial point geometries, and executes a distance matrix join.

4. **Air Quality Dispersion & Critical Receptor Screening**:
   > *"Query OpenAQ air monitoring stations, identify stations reporting PM2.5 exceeding 150 ug/m3, and highlight schools and hospitals located within 2 km of these stations."*

---

## Free Cloud Deployment Architecture

SpatialMind can be deployed to production 100% free with the following verified stack:

### 1. Database: Supabase (Free Managed PostgreSQL + PostGIS)
1. Sign up at [supabase.com](https://supabase.com) and create a free project.
2. Navigate to **Database** -> **Extensions**, search for `postgis`, and toggle it **ON**.
3. Under **Project Settings** -> **Database**, copy your **Connection URI**:
   ```env
   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```

### 2. Cache & Message Broker: Upstash Redis (Free Serverless Redis)
1. Create a free Redis database at [upstash.com](https://upstash.com).
2. Copy the `rediss://...` connection string into your environment:
   ```env
   REDIS_URL=rediss://default:[PASSWORD]@[ENDPOINT].upstash.io:6379
   ```

### 3. Backend: Render.com (Free Docker Web Service)
1. Push this repository to GitHub.
2. Sign in to [render.com](https://render.com) -> **New +** -> **Web Service**.
3. Select your repository `COT-Geospatial`.
4. Choose **Docker** runtime:
   - Root Directory: `SpatialMind-backend`
   - Dockerfile: `SpatialMind-backend/Dockerfile`
   - Instance Type: **Free**
5. Add environment variables:
   - `DATABASE_URL` = your Supabase PostGIS connection URI
   - `REDIS_URL` = your Upstash Redis URL
   - `LLM_PROVIDER` = `gemini` (or `anthropic` / `groq`)
   - `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY` = your secret key
6. Deploy the web service. Render provides a live SSL domain (e.g. `https://spatialmind-backend.onrender.com`).

### 4. Frontend: Vercel (Free Edge Static SPA Hosting)
1. Sign in to [vercel.com](https://vercel.com) -> **Add New** -> **Project**.
2. Import your GitHub repository `COT-Geospatial`.
3. Configure project settings:
   - Framework Preset: **Vite**
   - Root Directory: `SpatialMind-frontend`
4. Set environment variables:
   - `VITE_API_URL` = `https://spatialmind-backend.onrender.com`
   - `VITE_WS_URL` = `wss://spatialmind-backend.onrender.com/ws`
5. Click **Deploy**. Vercel serves the frontend on a high-speed CDN with zero infrastructure fees.

---

## Environment Variables Reference

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://postgres:postgres@db:5432/spatialdb` | PostGIS connection URI |
| `REDIS_URL` | `redis://redis:6379/0` | Redis broker and cache URL |
| `CELERY_BROKER_URL` | Inherits `REDIS_URL` | Celery task queue broker |
| `CELERY_RESULT_BACKEND` | Inherits `REDIS_URL` | Celery asynchronous results backend |
| `LLM_PROVIDER` | `gemini` | Active provider (`anthropic`, `gemini`, `groq`, `openai`) |
| `LLM_MODEL` | *(provider default)* | Active model ID override |
| `ANTHROPIC_API_KEY` | *(optional)* | Anthropic Claude API key |
| `GOOGLE_API_KEY` | *(optional)* | Google Gemini AI Studio API key |
| `GROQ_API_KEY` | *(optional)* | Groq Cloud API key |
| `OPENAI_API_KEY` | *(optional)* | OpenAI API key |
| `UPLOAD_DIR` | `/app/uploads` | Path for uploaded vector/raster files |
| `RESULT_DIR` | `/app/results` | Path for generated geoprocessing results |
| `VITE_API_URL` | `http://localhost:8000` | Backend API Gateway URL for the frontend |
| `VITE_WS_URL` | `ws://localhost:8000/ws` | WebSocket telemetry URL for the frontend |

---

## Repository Directory Structure

```
COT-Geospatial/
├── SpatialMind-backend/           # FastAPI geoprocessing backend
│   ├── app/
│   │   ├── api/                 # REST endpoints (settings, custom-apis, layers, query, upload)
│   │   ├── core/                # Configuration, Celery, Redis & WebSocket managers
│   │   ├── llm/                 # CoT agent, Universal LLM client & RAG retriever
│   │   │   └── knowledge_base/  # Curated spatial knowledge files & system schemas
│   │   ├── models/              # SQLAlchemy & GeoAlchemy2 relational models
│   │   ├── schemas/             # Pydantic validation schemas
│   │   ├── services/            # Custom API service & geoprocessing execution engines
│   │   ├── sockets/             # WebSocket route endpoints
│   │   ├── tasks/               # Celery asynchronous task definitions
│   │   └── utils/               # Geospatial computation utilities
│   ├── config/                  # Persistent configuration (custom_apis.json, etc.)
│   ├── Dockerfile               # Production backend container definition
│   └── requirements.txt         # Python dependencies
├── SpatialMind-frontend/          # React 18 + Vite frontend
│   ├── src/
│   │   ├── api/                 # Axios API clients & layer utilities
│   │   ├── components/          # MapViewer (multi-basemap & HUD), SettingsModal, ChatWindow
│   │   ├── hooks/               # Application context & actions
│   │   └── socket/              # WebSocket client service
│   ├── nginx.conf               # Production Nginx reverse proxy configuration
│   ├── vite.config.js           # Vite build & proxy configuration
│   └── Dockerfile               # Multi-stage production container
├── docker-compose.yml           # Multi-container orchestration (FastAPI, PostGIS, Redis, Celery, React)
├── run.ps1                      # Windows PowerShell startup script
├── run.sh                       # Linux/macOS startup script
├── .env.example                 # Sample environment configuration
└── README.md                    # Project documentation
```

---

## License

This project is licensed under the MIT License.
