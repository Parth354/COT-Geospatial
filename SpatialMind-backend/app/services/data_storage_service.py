# Path: app/services/data_storage_service.py

import os
import shutil
import logging
from pathlib import Path
from typing import List, Dict, Tuple

from app.models.database import SessionLocal
from app.models.dataset import Dataset 
from app.models.layer import Layer 
from app.models.result import Result
from app.core.config import settings

# Setup logger for this service
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants for file management
REQUIRED_SHP_COMPONENTS = [".shp", ".shx", ".dbf", ".prj", ".cpg", ".sbn", ".sbx"]
BASE_UPLOAD_PATH = Path(settings.UPLOAD_DIR).resolve()

# NEW constant for system-wide base layers
BASE_SYSTEM_FILES_PATH = Path("./app/llm/knowledge_base/system_files").resolve()

class JobDataService:
    """
    Manages the staging and cleanup of data files for a specific analysis job.
    This service ensures that each job runs in an isolated data environment and acts as the
    single source of truth for all job-related file paths.
    """
    def __init__(self, job_id: str):
        if not job_id:
            raise ValueError("A valid job_id is required to initialize JobDataService.")
        
        self.job_id = job_id
        # Creates a dedicated, isolated directory for this job's data
        self.job_data_dir = BASE_UPLOAD_PATH / self.job_id
        self.job_data_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"JobDataService initialized for job '{self.job_id}' at path: {self.job_data_dir}")

    def _copy_shapefile_components(self, src_path: Path, dest_dir: Path):
        """Intelligently copies all components of a shapefile to a destination directory."""
        stem = src_path.stem
        src_dir = src_path.parent
        # Flexible check for common required components
        for ext in {".shp", ".shx", ".dbf", ".prj"}:
            src_file = src_dir / f"{stem}{ext}"
            if src_file.exists():
                try:
                    shutil.copy(src_file, dest_dir)
                except Exception as e:
                    logger.warning(f"Could not copy shapefile component {src_file}: {e}")

    def stage_files_for_job(self, dataset_ids: List[str]) -> Dict[str, str]:
        """
        Prepares the data environment for a job by copying source files into the
        isolated job directory.
        """
        logger.info(f"Staging {len(dataset_ids)} datasets for job '{self.job_id}'.")
        staged_file_map = {}
        db = SessionLocal()
        
        try:
            if not dataset_ids:
                logger.info("No datasets to stage for this job.")
                return {}

            datasets_to_stage = db.query(Dataset).filter(Dataset.dataset_id.in_(dataset_ids)).all()
            
            for ds in datasets_to_stage:
                src_path_str = ds.file_path 
                if not src_path_str:
                    logger.warning(f"Dataset '{ds.name}' (ID: {ds.dataset_id}) has no file path, skipping.")
                    continue

                src_path = Path(src_path_str)
                if not src_path.exists():
                    logger.warning(f"Source file for dataset '{ds.name}' not found at '{src_path}', skipping.")
                    continue

                logical_name = src_path.name
                
                try:
                    if src_path.suffix.lower() == ".shp":
                        self._copy_shapefile_components(src_path, self.job_data_dir)
                        dest_path_str = str(self.job_data_dir / logical_name)
                    else:
                        dest_path = self.job_data_dir / logical_name
                        shutil.copy(src_path, dest_path)
                        dest_path_str = str(dest_path.resolve())

                    staged_file_map[logical_name] = dest_path_str
                    logger.info(f"Successfully staged '{logical_name}' for job '{self.job_id}'.")
                
                except Exception as e:
                    logger.error(f"Failed to stage file '{logical_name}' for job '{self.job_id}'. Error: {e}", exc_info=True)
            
        finally:
            db.close()

        logger.info(f"Staging complete for job '{self.job_id}'. {len(staged_file_map)} files ready.")
        return staged_file_map

    def cleanup_job_data(self):
        """Removes the isolated directory containing all data staged for this job."""
        if self.job_data_dir.exists():
            try:
                shutil.rmtree(self.job_data_dir)
                logger.info(f"Successfully cleaned up job data directory for job '{self.job_id}': {self.job_data_dir}")
            except Exception as e:
                logger.error(f"Failed to clean up job data for job '{self.job_id}'. Error: {e}", exc_info=True)

    def get_job_data_path(self) -> Path:
        """Returns the path to the job-specific temporary data directory."""
        return self.job_data_dir

    def get_system_files_path(self) -> Path:
        """Returns the path to the system-wide data files directory."""
        return BASE_SYSTEM_FILES_PATH