# Path: app/llm/llm_factory.py

import logging
from app.core.config import settings
from app.llm.universal_llm import UniversalRestLLM

logger = logging.getLogger(__name__)
_llm_instances = {}

def get_llm(model_type: str = "auto", model: str = "") -> UniversalRestLLM:
    """
    Factory function returning a production-grade UniversalRestLLM.
    Supports Anthropic (Claude), Google Gemini, Groq, OpenAI, and Local Ollama.
    NO MOCKING: Calls actual provider endpoints and reports real authentication status.
    """
    provider = model_type if model_type in ["groq", "openai", "gemini", "anthropic", "ollama"] else settings.LLM_PROVIDER
    active_model = model or getattr(settings, "LLM_MODEL", "")
    instance_key = f"{provider}:{active_model}"

    if instance_key in _llm_instances:
        return _llm_instances[instance_key]

    logger.info(f"Initializing UniversalRestLLM for provider '{provider}' model='{active_model}'...")
    instance = UniversalRestLLM(provider=provider, model=active_model or None)
    _llm_instances[instance_key] = instance
    return instance
