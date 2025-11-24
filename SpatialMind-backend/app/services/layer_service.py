import json
import logging
from typing import Any, Dict, List, Optional

import redis
from sqlalchemy.orm import Session
from geoalchemy2.functions import (
    ST_AsGeoJSON, ST_Force2D, ST_Intersects,
    ST_MakeEnvelope, ST_Simplify, ST_Transform
)

from app.core.config import settings
from app.models.layer import Layer

logger = logging.getLogger(__name__)

# --- Redis Client Initialization ---
try:
    redis_pool = redis.ConnectionPool.from_url(settings.REDIS_URL, decode_responses=True)
    redis_client = redis.Redis(connection_pool=redis_pool)
    redis_client.ping()
    logger.info("Redis client connected successfully for LayerService.")
except redis.exceptions.ConnectionError as e:
    logger.error(f"FATAL: Could not connect to Redis. Caching will be disabled. Error: {e}")
    redis_client = None


class LayerService:
    """
    Handles optimized retrieval of vector layer data from PostGIS for map display.
    """
    MAX_FEATURE_LIMIT = 5000

    @staticmethod
    def get_layer_data(
        db: Session,
        layer_id: str,  # This ID now corresponds to a dataset_id
        bbox: Optional[List[float]] = None,
        zoom: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        
        simplify_tolerance = LayerService._calculate_simplification(zoom)
        bbox_str = ",".join(map(str, bbox)) if bbox else "none"
        cache_key = f"layer_data:v3:{layer_id}:{bbox_str}:{simplify_tolerance}"

        if redis_client:
            try:
                cached = redis_client.get(cache_key)
                if cached:
                    logger.info(f"Cache HIT for key: {cache_key}")
                    return json.loads(cached)
            except redis.exceptions.RedisError as e:
                logger.error(f"Redis cache GET failed for key {cache_key}: {e}")

        logger.info(f"Cache MISS for key: {cache_key}")

        # ✅ FIX: Filter by the dataset_id, not the layer_id (which is a feature's primary key).
        # The incoming `layer_id` parameter actually represents the ID of the parent dataset.
        
        # First, check if any records exist for this dataset_id
        total_count = db.query(Layer).filter(Layer.dataset_id == layer_id).count()
        logger.info(f"Total layer records in database for dataset_id '{layer_id}': {total_count}")
        
        if total_count == 0:
            logger.warning(f"No layer records found for dataset_id '{layer_id}'. Dataset may not be ingested yet.")
            return {"type": "FeatureCollection", "features": []}
        
        # Simplified query - first try without complex transformations to debug
        base_query = db.query(Layer.geom, Layer.properties).filter(Layer.dataset_id == layer_id)

        # Apply bbox filtering only at zoom levels 10 and above for performance
        if bbox and zoom is not None and zoom >= 10:
            west, south, east, north = bbox
            envelope = ST_MakeEnvelope(west, south, east, north, 4326)
            base_query = base_query.filter(ST_Intersects(Layer.geom, envelope))
            logger.info(f"Applied bbox filter: {bbox} for zoom {zoom}")
        else:
            logger.info(f"Fetching full layer without bbox filter for zoom level {zoom}")

        # Limit results before processing
        limited_query = base_query.limit(LayerService.MAX_FEATURE_LIMIT)
        
        logger.info(f"Executing query for dataset_id '{layer_id}' with limit {LayerService.MAX_FEATURE_LIMIT}")
        
        # Try simpler query first to see if data exists
        try:
            # First, try a simple query to see if we get any results
            simple_results = limited_query.all()
            logger.info(f"Query returned {len(simple_results)} raw results")
            
            if not simple_results:
                logger.warning(f"No results returned from query for dataset_id '{layer_id}'")
                return {"type": "FeatureCollection", "features": []}
            
            # Now apply transformations
            final_query = db.query(
                ST_AsGeoJSON(
                    ST_Transform(
                        ST_Simplify(
                            ST_Transform(ST_Force2D(Layer.geom), 3857),
                            simplify_tolerance
                        ),
                        4326
                    )
                ).label("geojson"),
                Layer.properties.label("properties")
            ).filter(Layer.dataset_id == layer_id)
            
            if bbox and zoom is not None and zoom >= 10:
                west, south, east, north = bbox
                envelope = ST_MakeEnvelope(west, south, east, north, 4326)
                final_query = final_query.filter(ST_Intersects(Layer.geom, envelope))
            
            final_query = final_query.limit(LayerService.MAX_FEATURE_LIMIT)
            results = final_query.all()
            logger.info(f"Final query returned {len(results)} transformed results")
            
        except Exception as e:
            logger.error(f"Error querying PostGIS layer '{layer_id}': {e}", exc_info=True)
            # Try even simpler fallback
            try:
                logger.info("Attempting fallback simple query...")
                fallback_results = db.query(Layer.geom, Layer.properties).filter(Layer.dataset_id == layer_id).limit(10).all()
                logger.info(f"Fallback query returned {len(fallback_results)} results")
                if fallback_results:
                    # Use simple ST_AsGeoJSON without transformations
                    simple_geojson = db.query(
                        ST_AsGeoJSON(ST_Force2D(Layer.geom)).label("geojson"),
                        Layer.properties.label("properties")
                    ).filter(Layer.dataset_id == layer_id).limit(LayerService.MAX_FEATURE_LIMIT).all()
                    results = simple_geojson
                else:
                    raise
            except Exception as fallback_error:
                logger.error(f"Fallback query also failed: {fallback_error}", exc_info=True)
                raise e

        features = [
            {"type": "Feature", "geometry": json.loads(row.geojson), "properties": row.properties}
            for row in results
            if row.geojson
        ]

        feature_collection = {"type": "FeatureCollection", "features": features}

        if redis_client and features: # Also good practice to only cache if there's data
            try:
                # Set a shorter cache time for empty results if desired, or don't cache them at all
                redis_client.setex(cache_key, 3600, json.dumps(feature_collection))
            except redis.exceptions.RedisError as e:
                logger.error(f"Redis cache SET failed for key {cache_key}: {e}")

        return feature_collection

    @staticmethod
    def _calculate_simplification(zoom: Optional[int]) -> float:
        if zoom is None or zoom > 18:
            return 0  # No simplification or maximum detail
        # A common simplification formula based on web mercator projection properties
        return 40075016.686 / (256 * (2 ** zoom)) / 10