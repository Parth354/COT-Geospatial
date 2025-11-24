import os
import uuid
import shutil
import zipfile
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional

import geopandas as gpd
import pandas as pd
import rasterio
from fastapi import UploadFile, HTTPException

from app.models.dataset import Dataset
from app.models.database import SessionLocal
from app.schemas.upload import UploadMetadata
from app.core.config import settings
from app.utils.file_type_detector import detect_file_type as validate_file_type

# Setup a dedicated logger for this service
logger = logging.getLogger(__name__)

# It's good practice to define constants at the top of the module
UPLOAD_DIR = Path(settings.UPLOAD_DIR).resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

SUPPORTED_VECTOR = ["geojson", "shapefile", "kml", "csv"]
SUPPORTED_RASTER = ["geotiff", "tif"]
REQUIRED_SHP_COMPONENTS = {".shp", ".shx", ".dbf", ".prj"}
# Add common coordinate column names for more flexible CSV parsing
POSSIBLE_LON_COLS = ['lon', 'long', 'longitude', 'x']
POSSIBLE_LAT_COLS = ['lat', 'latitude', 'y']

class FileService:
    @staticmethod
    def save_file(file: UploadFile, metadata: UploadMetadata) -> Dataset:
        """
        Main entry point for saving an uploaded file. This method orchestrates validation,
        storage, metadata extraction, and database registration.
        """
        dataset_id = str(uuid.uuid4())
        # The main working directory for this upload job.
        dataset_dir = UPLOAD_DIR / dataset_id
        dataset_dir.mkdir(parents=True, exist_ok=True)

        original_filename = file.filename
        logger.info(f"Starting upload process for '{original_filename}' with new dataset ID '{dataset_id}'.")

        try:
            validated_type = validate_file_type(original_filename)

            # Stage 1: Save the raw file to its isolated directory
            temp_file_path = dataset_dir / original_filename
            with temp_file_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Stage 2: Process the staged file (e.g., unzip)
            # The 'input_path' will point to the primary spatial file (e.g., the .shp or .geojson)
            if validated_type == "zip":
                input_path = FileService._handle_zip_upload(temp_file_path, dataset_dir)
                validated_type = "shapefile" # After unzipping, we treat it as a shapefile
            else:
                input_path = temp_file_path
            
            # Stage 3: Extract geographic info and convert to standard formats
            geo_info: Dict[str, Any] = {}
            geojson_path: Optional[Path] = None

            if validated_type in SUPPORTED_VECTOR:
                geojson_path = dataset_dir / f"{dataset_id}.geojson"
                gdf = FileService._convert_vector_to_geojson(input_path, validated_type, geojson_path)
                geo_info = FileService._extract_geo_info_from_gdf(gdf)
            elif validated_type in SUPPORTED_RASTER:
                geo_info = FileService._extract_geo_info_from_raster(input_path)
                geojson_path = None  # No GeoJSON preview for rasters in this implementation
            else:
                # This should be caught by validate_file_type, but serves as a failsafe
                raise HTTPException(status_code=400, detail=f"Unsupported file type: {validated_type}")

            # Stage 4: Create and commit the database record
            db = SessionLocal()
            try:
                ds = Dataset(
                    dataset_id=dataset_id,
                    name=metadata.name or original_filename,
                    file_type=validated_type,
                    file_path=str(input_path), # Store the path to the primary file, not the zip
                    geojson_path=str(geojson_path) if geojson_path else None,
                    size_mb=round(input_path.stat().st_size / (1024 * 1024), 2),
                    feature_count=geo_info.get("feature_count", 0),
                    bbox=geo_info.get("bbox", {}),
                    crs=geo_info.get("crs", "N/A"),
                    status="uploaded", # Set to 'uploaded' - ingestion must be triggered separately via /api/layers/ingest/{dataset_id}
                    tags=metadata.tags if isinstance(metadata.tags, list) else [],
                )
                db.add(ds)
                db.commit()
                db.refresh(ds)
                logger.info(f"Successfully saved and registered dataset '{ds.name}' (ID: {ds.dataset_id}).")
                return ds
            finally:
                db.close()

        except Exception as e:
            # If anything goes wrong at any stage, ensure the temporary upload directory is removed.
            if dataset_dir.exists():
                shutil.rmtree(dataset_dir)
            logger.error(f"Upload process failed for file '{original_filename}'. Cleaning up. Error: {e}", exc_info=True)
            # Re-raise the exception so the API route can return a 500 error.
            raise HTTPException(status_code=500, detail=f"An internal error occurred during file processing: {e}")

    @staticmethod
    def _handle_zip_upload(zip_path: Path, extract_dir: Path) -> Path:
        """Unzips an archive and finds the primary .shp file within it."""
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        
        # Search for the .shp file, which is the primary file for a shapefile dataset
        shp_files = list(extract_dir.glob("*.shp"))
        if not shp_files:
            raise ValueError("The provided ZIP archive does not contain a .shp file.")
        if len(shp_files) > 1:
            logger.warning(f"Multiple .shp files found in archive; using the first one: {shp_files[0].name}")

        primary_shp_path = shp_files[0]
        
        # Validate that the essential sidecar files for the shapefile also exist
        extensions_present = {p.suffix.lower() for p in extract_dir.glob(f"{primary_shp_path.stem}.*")}
        if not REQUIRED_SHP_COMPONENTS.issubset(extensions_present):
            missing = REQUIRED_SHP_COMPONENTS - extensions_present
            raise FileNotFoundError(f"Shapefile is incomplete. Missing required component(s): {', '.join(missing)}")
            
        return primary_shp_path

    @staticmethod
    def _convert_vector_to_geojson(input_path: Path, file_type: str, output_path: Path) -> gpd.GeoDataFrame:
        """Converts any supported vector format into a standardized GeoJSON file."""
        if file_type == "csv":
            df = pd.read_csv(input_path)
            # More robustly find longitude and latitude columns
            lon_col = next((c for c in df.columns if c.lower() in POSSIBLE_LON_COLS), None)
            lat_col = next((c for c in df.columns if c.lower() in POSSIBLE_LAT_COLS), None)
            if not (lon_col and lat_col):
                raise ValueError("CSV file must contain recognizable longitude (lon, long, x) and latitude (lat, y) columns.")
            gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df[lon_col], df[lat_col]), crs="EPSG:4326")
        else:
            gdf = gpd.read_file(input_path)
        
        # Standardize CRS to WGS84 (EPSG:4326), the web standard
        if gdf.crs is None:
            logger.warning(f"Input file '{input_path.name}' has no CRS defined. Assuming WGS84 (EPSG:4326).")
            gdf.set_crs("EPSG:4326", inplace=True)
        elif not gdf.crs.equals("EPSG:4326"):
            logger.info(f"Re-projecting '{input_path.name}' from {gdf.crs.to_string()} to EPSG:4326.")
            gdf = gdf.to_crs("EPSG:4326")
            
        # Write the standardized file
        gdf.to_file(output_path, driver="GeoJSON")
        return gdf

    @staticmethod
    def _extract_geo_info_from_gdf(gdf: gpd.GeoDataFrame) -> Dict[str, Any]:
        """Extracts key metadata from an in-memory GeoDataFrame."""
        bounds = gdf.total_bounds
        return {
            "crs": gdf.crs.to_string() if gdf.crs else "EPSG:4326",
            "feature_count": len(gdf),
            "bbox": {"west": bounds[0], "south": bounds[1], "east": bounds[2], "north": bounds[3]}
        }

    @staticmethod
    def _extract_geo_info_from_raster(file_path: Path) -> Dict[str, Any]:
        """Extracts key metadata from a raster file."""
        try:
            with rasterio.open(file_path) as src:
                bounds = src.bounds
                return {
                    "crs": src.crs.to_string() if src.crs else "Unknown",
                    "feature_count": 0, # Rasters don't have "features" in the vector sense
                    "bbox": {"west": bounds.left, "south": bounds.bottom, "east": bounds.right, "north": bounds.top}
                }
        except rasterio.errors.RasterioIOError as e:
            logger.error(f"Could not read raster file '{file_path.name}': {e}")
            raise ValueError(f"Invalid or unsupported raster file format.")