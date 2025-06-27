import os
import uuid
import shutil
import tempfile
from datetime import datetime
from app.models.dataset import Dataset
from app.models.database import SessionLocal
from app.schemas.upload import UploadMetadata
from app.core.config import settings
import fiona

UPLOAD_DIR = settings.UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)

class FileService:
    @staticmethod
    def save_file(file, metadata: UploadMetadata) -> Dataset:
        dataset_id = str(uuid.uuid4())

        temp_dir = tempfile.mkdtemp()
        file_path = os.path.join(temp_dir, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        with fiona.open(file_path) as src:
            crs = src.crs.to_string() if src.crs and hasattr(src.crs, "to_string") else "EPSG:4326"
            features = list(src)
            feature_count = len(features)
            bbox = src.bounds

        size_mb = os.path.getsize(file_path) / (1024 * 1024)

        dest_path = os.path.join(UPLOAD_DIR, dataset_id)
        os.makedirs(dest_path, exist_ok=True)
        final_path = os.path.join(dest_path, file.filename)
        shutil.move(file_path, final_path)

        tags = metadata.tags if isinstance(metadata.tags, list) else []

        bbox_dict = {
            "west": bbox[0],
            "south": bbox[1],
            "east": bbox[2],
            "north": bbox[3],
        }

        print("==== FileService Debug ====")
        print("UPLOAD_DIR:", UPLOAD_DIR)
        print("Final file path:", final_path)

        db = SessionLocal()
        ds = Dataset(
            dataset_id=dataset_id,
            name=metadata.name or file.filename,
            file_type=file.filename.split('.')[-1],
            size_mb=round(size_mb, 2),
            feature_count=feature_count,
            bbox=bbox_dict,
            crs=crs,
            status="processed",
            tags=tags,
        )
        db.add(ds)
        db.commit()
        db.refresh(ds)
        db.close()
        return ds
