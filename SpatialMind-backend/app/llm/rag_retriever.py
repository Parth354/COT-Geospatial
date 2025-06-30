import os
import logging
from pathlib import Path
from typing import Dict, List, TypedDict
from app.services.data_storage_service import JobDataService

# --- Type Definitions for Clarity ---
PRIMARY_EXTENSIONS = {'.shp', '.geojson', '.kml', '.csv', '.tif', '.tiff'}
REQUIRED_SHAPEFILE_EXTENSIONS = {".shp", ".shx", ".dbf", ".prj"}

logger = logging.getLogger(__name__)

class FileAsset(TypedDict):
    """A standard data structure representing a single logical file asset."""
    asset_id: str
    full_path: str
    description: str
    file_type: str

class RAGRetriever:
    """
    Handles the discovery of file assets available for an analysis job.
    Its main function is to provide the LLM agent with a "manifest" of all
    available data for the current job.
    """
    def __init__(self, job_id: str):
        self.job_id = job_id
        
        # ✅ FIX: Use the JobDataService to get the single source of truth for paths.
        # This guarantees that the RAG retriever looks for files in the exact same
        # temporary, sandboxed directory that the data staging service creates.
        data_service_instance = JobDataService(job_id=self.job_id)
        self.job_upload_dir = data_service_instance.get_job_data_path()
        self.system_files_dir = data_service_instance.get_system_files_path() # Added for consistency

        logger.info(f"RAGRetriever for job '{self.job_id}' initialized.")
        logger.info(f"-> Looking for user files in: {self.job_upload_dir}")
        logger.info(f"-> Looking for system files in: {self.system_files_dir}")

    def _group_files_as_assets(self, directory: Path) -> List[FileAsset]:
        """Scans a directory, identifies primary dataset files, and groups them logically."""
        assets: List[FileAsset] = []
        if not directory.exists():
            logger.warning(f"Asset directory not found, cannot scan for data: {directory}")
            return assets

        files_by_stem: Dict[str, List[Path]] = {}
        for f in directory.iterdir():
            if f.is_file():
                files_by_stem.setdefault(f.stem, []).append(f)

        for stem, file_paths in files_by_stem.items():
            primary_file = next((p for p in file_paths if p.suffix.lower() in PRIMARY_EXTENSIONS), None)
            
            if primary_file:
                file_type_raw = primary_file.suffix.lower().lstrip('.')
                file_type = 'shapefile' if file_type_raw == 'shp' else file_type_raw
                description = f"A '{file_type}' dataset named '{primary_file.name}'"
                asset_id = primary_file.name

                if file_type == 'shapefile':
                    extensions = {p.suffix.lower() for p in file_paths}
                    if not REQUIRED_SHAPEFILE_EXTENSIONS.issubset(extensions):
                        warning_msg = "(Warning: Missing required shapefile components, may not be usable)"
                        logger.warning(f"Shapefile '{primary_file.name}' is incomplete. {warning_msg}")
                        description += f" {warning_msg}"
                
                assets.append(FileAsset(
                    asset_id=asset_id,
                    full_path=str(primary_file.resolve()),
                    description=description,
                    file_type=file_type
                ))
        return assets

    def get_all_available_data_context(self) -> str:
        """
        Scans all data sources and returns a single, formatted string for the LLM prompt.
        """
        logger.info(f"Scanning for all available file assets for job '{self.job_id}'...")
        
        user_assets = self._group_files_as_assets(self.job_upload_dir)
        system_assets = self._group_files_as_assets(self.system_files_dir)
        all_assets = user_assets + system_assets

        if not all_assets:
            return "No data files are currently available for this task. You must use tools that do not require file inputs."

        context_parts = ["The following data files are available for you to use as tool inputs:\n"]
        for asset in all_assets:
            context_parts.append(f"- **`{asset['asset_id']}`**: {asset['description']}")
        return "\n".join(context_parts)
    
    def get_initial_file_map(self) -> Dict[str, str]:
        """
        Generates the simple dictionary mapping asset_id to its absolute path.
        This is used by the ToolExecutor to load data at the start of a job.
        """
        user_assets = self._group_files_as_assets(self.job_upload_dir)
        system_assets = self._group_files_as_assets(self.system_files_dir)
        all_assets = user_assets + system_assets

        if not all_assets:
            logger.info(f"No initial file assets found for job '{self.job_id}'.")

        return {asset['asset_id']: asset['full_path'] for asset in all_assets}