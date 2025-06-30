# Path: app/llm/llm_factory.py

import logging
from app.core.config import settings
from langchain_google_genai import ChatGoogleGenerativeAI

logger = logging.getLogger(__name__)
_llm_instances = {}

def get_llm(model_type: str = "gemini"):
    """
    Factory function to get a shared LangChain-compatible instance of a language model.
    """
    if model_type in _llm_instances:
        return _llm_instances[model_type]

    logger.info(f"Initializing LLM of type '{model_type}' for the first time...")
    llm_instance = None

    if model_type == "gemini":
        if not settings.GOOGLE_API_KEY:
            logger.error("FATAL: GOOGLE_API_KEY is not set in environment variables.")
            raise ValueError("GOOGLE_API_KEY must be configured for the Gemini model.")
        
        try:
            # ✅ FIX: This ensures we are creating and returning the LangChain wrapper object.
            # The agent expects this specific object because it uses the standard `.invoke()` method.
            llm_instance = ChatGoogleGenerativeAI(
                model="gemini-1.5-flash",
                google_api_key=settings.GOOGLE_API_KEY,
                temperature=0.0,
                convert_system_message_to_human=True
            )
            logger.info("Successfully initialized LangChain-wrapped Google Gemini model.")
        except Exception as e:
            logger.error(f"Failed to initialize Gemini model: {e}", exc_info=True)
            raise RuntimeError("Could not connect to Google Gemini API.")
    
    # ... (Your local 'mistral' logic would go here, also ensuring it returns a LangChain-compatible object)

    else:
        raise ValueError(f"Unsupported model type requested: '{model_type}'")

    _llm_instances[model_type] = llm_instance
    return llm_instance