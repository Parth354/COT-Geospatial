<#
.SYNOPSIS
    Starts SpatialMind in Docker containers.
#>

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         Starting SpatialMind Geospatial AI Platform       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check if Docker daemon is running
Write-Host "`n[1/3] Checking Docker engine..." -ForegroundColor Yellow
$dockerStatus = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Docker Desktop daemon is not currently active." -ForegroundColor Red
    Write-Host "    Please open the Docker Desktop application from your Windows Start Menu" -ForegroundColor White
    Write-Host "    and wait until the Docker icon indicates 'Engine running'." -ForegroundColor White
    Write-Host "`nAttempting to launch Docker Desktop..." -ForegroundColor Cyan
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -ErrorAction SilentlyContinue
    Write-Host "After Docker Desktop has fully loaded, please re-run this script: .\run.ps1" -ForegroundColor Yellow
    Exit 1
}

Write-Host "Docker daemon is active and responsive." -ForegroundColor Green

# 2. Build and start containers
Write-Host "`n[2/3] Building and starting containerized services..." -ForegroundColor Yellow
docker compose up --build -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Failed to start containers. Check logs with: docker compose logs" -ForegroundColor Red
    Exit 1
}

# 3. Status summary
Write-Host "`n[3/3] SpatialMind services are now running!" -ForegroundColor Green
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Web Application (Frontend):  http://localhost:5173" -ForegroundColor Cyan
Write-Host "  FastAPI Swagger Docs:        http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  FastAPI Healthcheck:         http://localhost:8000/health" -ForegroundColor Cyan
Write-Host "  PostgreSQL PostGIS:          localhost:5432 (spatialdb)" -ForegroundColor Cyan
Write-Host "  Redis:                       localhost:6379" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "`nTo view real-time logs:" -ForegroundColor White
Write-Host "  docker compose logs -f" -ForegroundColor DarkCyan
Write-Host "`nTo stop the platform:" -ForegroundColor White
Write-Host "  docker compose down" -ForegroundColor DarkCyan
