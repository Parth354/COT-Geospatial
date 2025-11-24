from redis.asyncio import Redis
from app.core.config import settings

# Async client for WebSocket subscribers
redis_async_client = Redis.from_url(
    settings.REDIS_URL,
    decode_responses=True
)
