import redis
import json
from typing import Dict, Any

class RedisClient:
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis = redis.from_url(redis_url, decode_responses=True)
    
    def publish_websocket_message(self, job_id: str, message: Dict[str, Any]):
        """Publish a message to Redis for WebSocket broadcasting"""
        channel = f"websocket:{job_id}"
        self.redis.publish(channel, json.dumps(message))
        print(f"[Redis] Published to {channel}: {message}")

# Singleton instance
redis_client = RedisClient()