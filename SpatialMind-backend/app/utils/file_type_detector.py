from pathlib import Path

SUPPORTED_TYPES = {
    '.geojson': 'geojson',
    '.json': 'geojson',
    '.shp': 'shapefile',
    '.zip': 'shapefile_zip',
    '.tif': 'geotiff',
    '.tiff': 'geotiff',
    '.kml': 'kml',
    '.csv': 'csv',
}

def detect_file_type(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    file_type = SUPPORTED_TYPES.get(ext)
    if not file_type:
        raise ValueError(f"Unsupported file extension: '{ext}'")
    return file_type
