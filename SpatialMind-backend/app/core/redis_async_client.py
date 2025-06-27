from redis.asyncio import Redis

# Async client for WebSocket subscribers
redis_async_client = Redis(host='localhost', port=6379, decode_responses=True)
