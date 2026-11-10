# Path: app/llm/llm_factory.py

import logging
from app.core.config import settings
from app.llm.universal_llm import UniversalRestLLM

logger = logging.getLogger(__name__)
_llm_instances = {}

def get_llm(model_type: str = "auto") -> UniversalRestLLM:
    """
    Factory function returning a production-grade UniversalRestLLM.
    Supports Groq, OpenAI, Google Gemini, and Local Ollama with genuine API execution.
    NO MOCKING: Calls actual endpoints and reports real authentication status.
    """
    provider = model_type if model_type in ["groq", "openai", "gemini", "ollama"] else settings.LLM_PROVIDER
    instance_key = f"{provider}"

    if instance_key in _llm_instances:
        return _llm_instances[instance_key]

    logger.info(f"Initializing UniversalRestLLM for provider '{provider}'...")
    instance = UniversalRestLLM(provider=provider)
    _llm_instances[instance_key] = instance
    return instance
