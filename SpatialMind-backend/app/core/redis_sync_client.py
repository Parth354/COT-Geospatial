import redis
import json
import logging
from typing import Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

class RedisSyncClient:
    def __init__(self, redis_url: str):
        self.redis = None
        try:
            # Initialize the Redis connection
            self.redis = redis.from_url(redis_url, decode_responses=True)
            self.redis.ping()
            logger.info("SYNC Redis client connected successfully.")
        except redis.exceptions.ConnectionError as e:
            logger.error(f"FATAL: Could not connect SYNC Redis client. WebSocket publishing will fail. Error: {e}")
            self.redis = None

    def publish_websocket_message(self, job_id: str, message):
        """Publishes a message to a Redis channel for WebSocket broadcasting.
        
        Args:
            job_id: The job/dataset ID to publish to
            message: Either a dict or a JSON string. If dict, will be JSON-encoded.
        """
        if not self.redis:
            logger.error("Cannot publish WebSocket message: SYNC Redis client is not connected.")
            return

        try:
            channel = f"websocket:{job_id}"
            # If message is already a string (JSON), use it directly
            # If it's a dict, convert to JSON string
            if isinstance(message, str):
                message_payload = message
            else:
                message_payload = json.dumps(message)

            self.redis.publish(channel, message_payload)
            logger.info(f"[Redis] Published to {channel}: {message_payload[:200]}...")  # Truncate long messages
        except Exception as e:
            logger.error(f"Failed to publish WebSocket message for job_id '{job_id}': {e}", exc_info=True)

# Singleton instance
redis_sync_client = RedisSyncClient(settings.REDIS_URL)
