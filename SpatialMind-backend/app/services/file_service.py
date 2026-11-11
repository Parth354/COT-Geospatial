import json
import os
import uuid
import shutil
import zipfile
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

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

class SimpleDataset:
    """Lightweight in-memory and disk fallback Dataset representation when PostgreSQL is offline."""
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

    def __repr__(self):
        return f"<SimpleDataset id={getattr(self, 'dataset_id', None)} name={getattr(self, 'name', None)}>"

class FileService:
    @staticmethod
    def get_disk_datasets() -> List[Any]:
        """Scans the uploads directory for locally registered datasets."""
        datasets = []
        if not UPLOAD_DIR.exists():
            return datasets
        for folder in UPLOAD_DIR.iterdir():
            if folder.is_dir():
                meta_file = folder / "metadata.json"
                if meta_file.exists():
                    try:
                        data = json.loads(meta_file.read_text(encoding="utf-8"))
                        up_time = None
                        if data.get("upload_time"):
                            try:
                                up_time = datetime.fromisoformat(data["upload_time"])
                            except Exception:
                                up_time = datetime.now(timezone.utc)
                        else:
                            up_time = datetime.now(timezone.utc)

                        datasets.append(SimpleDataset(
                            dataset_id=data.get("dataset_id", folder.name),
                            name=data.get("name", folder.name),
                            file_type=data.get("file_type", "geojson"),
                            file_path=data.get("file_path"),
                            geojson_path=data.get("geojson_path"),
                            size_mb=float(data.get("size_mb", 0.0)),
                            feature_count=int(data.get("feature_count", 0)),
                            bbox=data.get("bbox", {}),
                            crs=data.get("crs", "EPSG:4326"),
                            status=data.get("status", "processed"),
                            tags=data.get("tags", []),
                            upload_time=up_time
                        ))
                    except Exception as e:
                        logger.warning(f"Failed to read dataset metadata from {meta_file}: {e}")
        return datasets

    @staticmethod
    def get_disk_dataset(dataset_id: str) -> Optional[Any]:
        folder = UPLOAD_DIR / dataset_id
        meta_file = folder / "metadata.json"
        if meta_file.exists():
            try:
                data = json.loads(meta_file.read_text(encoding="utf-8"))
                up_time = None
                if data.get("upload_time"):
                    try:
                        up_time = datetime.fromisoformat(data["upload_time"])
                    except Exception:
                        up_time = datetime.now(timezone.utc)
                else:
                    up_time = datetime.now(timezone.utc)

                return SimpleDataset(
                    dataset_id=data.get("dataset_id", folder.name),
                    name=data.get("name", folder.name),
                    file_type=data.get("file_type", "geojson"),
                    file_path=data.get("file_path"),
                    geojson_path=data.get("geojson_path"),
                    size_mb=float(data.get("size_mb", 0.0)),
                    feature_count=int(data.get("feature_count", 0)),
                    bbox=data.get("bbox", {}),
                    crs=data.get("crs", "EPSG:4326"),
                    status=data.get("status", "processed"),
                    tags=data.get("tags", []),
                    upload_time=up_time
                )
            except Exception as e:
                logger.warning(f"Failed to read metadata for dataset '{dataset_id}': {e}")
        return None
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
            if validated_type in ("zip", "shapefile_zip"):
                input_path = FileService._handle_zip_upload(temp_file_path, dataset_dir)
                validated_type = "shapefile"
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
                geojson_path = None
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported file type: {validated_type}")

            # Stage 4: Persist dataset metadata to disk registry first for fault tolerance
            now_utc = datetime.now(timezone.utc)
            meta_dict = {
                "dataset_id": dataset_id,
                "name": metadata.name or original_filename,
                "file_type": validated_type,
                "file_path": str(input_path),
                "geojson_path": str(geojson_path) if geojson_path else None,
                "size_mb": round(input_path.stat().st_size / (1024 * 1024), 2),
                "feature_count": geo_info.get("feature_count", 0),
                "bbox": geo_info.get("bbox", {}),
                "crs": geo_info.get("crs", "N/A"),
                "status": "processed",
                "tags": metadata.tags if isinstance(metadata.tags, list) else [],
                "upload_time": now_utc.isoformat(),
            }
            meta_file = dataset_dir / "metadata.json"
            meta_file.write_text(json.dumps(meta_dict, indent=2), encoding="utf-8")

            # Stage 5: Attempt PostgreSQL database record registration
            try:
                db = SessionLocal()
                try:
                    ds = Dataset(
                        dataset_id=dataset_id,
                        name=meta_dict["name"],
                        file_type=meta_dict["file_type"],
                        file_path=meta_dict["file_path"],
                        geojson_path=meta_dict["geojson_path"],
                        size_mb=meta_dict["size_mb"],
                        feature_count=meta_dict["feature_count"],
                        bbox=meta_dict["bbox"],
                        crs=meta_dict["crs"],
                        status="processed",
                        tags=meta_dict["tags"],
                    )
                    db.add(ds)
                    db.commit()
                    db.refresh(ds)
                    logger.info(f"Successfully saved and registered dataset '{ds.name}' (ID: {ds.dataset_id}) in PostgreSQL.")
                    return ds
                finally:
                    db.close()
            except Exception as db_err:
                logger.warning(
                    f"PostgreSQL dataset registration unavailable: {db_err}. "
                    f"Dataset '{meta_dict['name']}' safely persisted to local disk registry."
                )
                return SimpleDataset(
                    dataset_id=dataset_id,
                    name=meta_dict["name"],
                    file_type=meta_dict["file_type"],
                    file_path=meta_dict["file_path"],
                    geojson_path=meta_dict["geojson_path"],
                    size_mb=meta_dict["size_mb"],
                    feature_count=meta_dict["feature_count"],
                    bbox=meta_dict["bbox"],
                    crs=meta_dict["crs"],
                    status="processed",
                    tags=meta_dict["tags"],
                    upload_time=now_utc,
                )

        except Exception as e:
            # Only clean up directory if file conversion genuinely failed before saving metadata
            if dataset_dir.exists() and not (dataset_dir / "metadata.json").exists():
                shutil.rmtree(dataset_dir)
            logger.error(f"Upload process failed for file '{original_filename}'. Error: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"An internal error occurred during file processing: {e}")

    @staticmethod
    def _handle_zip_upload(zip_path: Path, extract_dir: Path) -> Path:
        """Unzips an archive and finds the primary .shp file within it."""
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        
        shp_files = list(extract_dir.glob("*.shp"))
        if not shp_files:
            raise ValueError("The provided ZIP archive does not contain a .shp file.")
        if len(shp_files) > 1:
            logger.warning(f"Multiple .shp files found in archive; using the first one: {shp_files[0].name}")

        primary_shp_path = shp_files[0]
        
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
            lon_col = next((c for c in df.columns if c.lower() in POSSIBLE_LON_COLS), None)
            lat_col = next((c for c in df.columns if c.lower() in POSSIBLE_LAT_COLS), None)
            if not (lon_col and lat_col):
                raise ValueError("CSV file must contain recognizable longitude (lon, long, x) and latitude (lat, y) columns.")
            gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df[lon_col], df[lat_col]), crs="EPSG:4326")
        elif file_type in ["geojson", "json"]:
            with open(input_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            features = data.get("features", [])
            gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
        else:
            try:
                gdf = gpd.read_file(input_path)
            except Exception:
                with open(input_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                features = data.get("features", [])
                gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
        
        if gdf.crs is None:
            logger.warning(f"Input file '{input_path.name}' has no CRS defined. Assuming WGS84 (EPSG:4326).")
            gdf.set_crs("EPSG:4326", inplace=True)
        elif not gdf.crs.equals("EPSG:4326"):
            logger.info(f"Re-projecting '{input_path.name}' from {gdf.crs.to_string()} to EPSG:4326.")
            gdf = gdf.to_crs("EPSG:4326")
            
        try:
            output_path.write_text(gdf.to_json(), encoding="utf-8")
        except Exception:
            gdf.to_file(output_path, driver="GeoJSON")
        return gdf

    @staticmethod
    def _extract_geo_info_from_gdf(gdf: gpd.GeoDataFrame) -> Dict[str, Any]:
        """Extracts key metadata from an in-memory GeoDataFrame safely."""
        feature_count = len(gdf)
        bounds = gdf.total_bounds if feature_count > 0 else []
        if len(bounds) == 4:
            bbox = {
                "west": float(bounds[0]),
                "south": float(bounds[1]),
                "east": float(bounds[2]),
                "north": float(bounds[3])
            }
        else:
            bbox = {"west": 0.0, "south": 0.0, "east": 0.0, "north": 0.0}

        return {
            "crs": gdf.crs.to_string() if gdf.crs else "EPSG:4326",
            "feature_count": feature_count,
            "bbox": bbox
        }

    @staticmethod
    def _extract_geo_info_from_raster(file_path: Path) -> Dict[str, Any]:
        """Extracts key metadata from a raster file."""
        try:
            with rasterio.open(file_path) as src:
                bounds = src.bounds
                return {
                    "crs": src.crs.to_string() if src.crs else "Unknown",
                    "feature_count": 0,
                    "bbox": {"west": bounds.left, "south": bounds.bottom, "east": bounds.right, "north": bounds.top}
                }
        except rasterio.errors.RasterioIOError as e:
            logger.error(f"Could not read raster file '{file_path.name}': {e}")
            raise ValueError(f"Invalid or unsupported raster file format.")
