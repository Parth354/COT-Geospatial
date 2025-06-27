from sqlalchemy.orm import Session
from typing import List, Any, Dict, Optional
from app.models.layer import Layer
from app.models.database import SessionLocal
import json
import redis
from shapely.geometry import shape, mapping
from geoalchemy2.functions import ST_AsGeoJSON, ST_Transform, ST_Simplify, ST_Intersects
from sqlalchemy import func, text
from app.core.config import settings

# Redis client for caching
redis_client = redis.Redis.from_url(settings.REDIS_URL)

class LayerService:
    @staticmethod
    def get_layer_data(
        db: Session,
        layer_id: str,
        bbox: Optional[List[float]] = None,
        simplify_tolerance: Optional[float] = None
    ) -> Dict[str, Any]:
        # Check cache first
        cache_key = f"layer:{layer_id}:{bbox}:{simplify_tolerance}"
        cached = redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

        # Fetch layer metadata
        layer = db.query(Layer).filter(Layer.layer_id == layer_id).first()
        if not layer:
            return None

        # Build PostGIS query
        geom_col = text("geom")
        query = db.query(
            func.ST_AsGeoJSON(
                ST_Transform(
                    ST_Simplify(func.ST_Force2D(func.cast(text("geom"), text("geometry"))), simplify_tolerance if simplify_tolerance else 0),
                    4326
                )
            ).label("geojson"),
            text("properties")
        )
        if bbox:
            west, south, east, north = bbox
            query = query.filter(
                ST_Intersects(
                    func.ST_MakeEnvelope(west, south, east, north, 4326),
                    text("geom")
                )
            )
        results = query.all()

        # Assemble features
        features = []
        for row in results:
            geo = json.loads(row.geojson)
            props = row.properties
            features.append({
                "type": "Feature",
                "geometry": geo,
                "properties": props
            })

        response = {"type": "FeatureCollection", "features": features}

        # Cache for 1 hour
        redis_client.setex(cache_key, 3600, json.dumps(response))
        return response