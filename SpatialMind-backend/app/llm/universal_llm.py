import json
import logging
import os
import time
import urllib.request
import urllib.error
from typing import Any, Optional

logger = logging.getLogger(__name__)

class LLMResponse:
    def __init__(self, content: str):
        self.content = content

class UniversalRestLLM:
    """
    Production-grade multi-provider REST client for LLM inference.
    Supports Groq, OpenAI, Google Gemini, and Local Ollama using pure-Python standard libraries.
    Requires no native C-extensions or DLLs, ensuring complete portability on Windows.
    NO MOCKING: Executes genuine API requests and enforces real authentication.
    """

    def __init__(
        self,
        provider: str = "auto",
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        ollama_url: str = "http://localhost:11434"
    ):
        self.ollama_url = ollama_url
        self.provider, self.api_key, self.model = self._resolve_provider_and_key(provider, api_key, model)
        logger.info(f"[UniversalRestLLM] Initialized provider='{self.provider}' model='{self.model}'")

    def _resolve_provider_and_key(self, provider: str, api_key: Optional[str], model: Optional[str]):
        """Detects the active provider and validates key presence without mock bypasses."""
        from app.core.config import settings

        groq_key = api_key or getattr(settings, "GROQ_API_KEY", "") or os.environ.get("GROQ_API_KEY", "")
        openai_key = api_key or getattr(settings, "OPENAI_API_KEY", "") or os.environ.get("OPENAI_API_KEY", "")
        gemini_key = api_key or getattr(settings, "GOOGLE_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
        anthropic_key = api_key or getattr(settings, "ANTHROPIC_API_KEY", "") or os.environ.get("ANTHROPIC_API_KEY", "")
        configured_model = model or getattr(settings, "LLM_MODEL", "") or os.environ.get("LLM_MODEL", "")

        # Ignore known revoked/leaked demo keys
        if gemini_key and gemini_key.startswith("AIzaSyA0TWhe__RsAwVAReUPzKZ5TCuUJPSmb-I"):
            logger.warning("[UniversalRestLLM] Configured GOOGLE_API_KEY is revoked by Google (leaked demo key).")
            gemini_key = ""

        if provider == "anthropic" or (provider == "auto" and anthropic_key):
            return "anthropic", anthropic_key, configured_model or "claude-3-5-sonnet-20241022"
        elif provider == "groq" or (provider == "auto" and groq_key):
            return "groq", groq_key, configured_model or "llama-3.3-70b-versatile"
        elif provider == "openai" or (provider == "auto" and openai_key):
            return "openai", openai_key, configured_model or "gpt-4o-mini"
        elif provider == "gemini" or (provider == "auto" and gemini_key):
            return "gemini", gemini_key, configured_model or "gemini-3.5-flash-lite"
        elif provider == "ollama":
            return "ollama", "", configured_model or "mistral"
        
        # If auto and nothing configured, return best candidate with empty key for diagnostic reporting
        return "gemini", gemini_key, configured_model or "gemini-3.5-flash-lite"

    def invoke(self, prompt: Any) -> LLMResponse:
        prompt_text = prompt.to_string() if hasattr(prompt, "to_string") else str(prompt)

        if not self.api_key and self.provider != "ollama":
            err_msg = "Please add your API key in the Settings panel to enable AI analysis."
            logger.warning(f"No API key configured for provider '{self.provider}'. Directing user to Settings panel.")
            raise RuntimeError(err_msg)

        if self.provider == "gemini":
            return self._call_gemini(prompt_text)
        elif self.provider == "anthropic":
            return self._call_anthropic(prompt_text)
        elif self.provider in ("openai", "groq"):
            return self._call_openai_compatible(prompt_text)
        elif self.provider == "ollama":
            return self._call_ollama(prompt_text)
        else:
            raise ValueError(f"Unsupported LLM provider: {self.provider}")

    def _call_anthropic(self, prompt_text: str) -> LLMResponse:
        endpoint = "https://api.anthropic.com/v1/messages"
        payload = {
            "model": self.model or "claude-3-5-sonnet-20241022",
            "max_tokens": 2048,
            "system": "You are a professional geospatial intelligence agent. Always output valid JSON conforming to the requested schema.",
            "messages": [
                {"role": "user", "content": prompt_text}
            ]
        }
        req_data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
        req = urllib.request.Request(endpoint, data=req_data, headers=headers)

        try:
            with urllib.request.urlopen(req, timeout=35) as resp:
                resp_json = json.loads(resp.read().decode("utf-8"))
                text = resp_json["content"][0]["text"]
                return LLMResponse(text)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            logger.error(f"[ANTHROPIC API Error] HTTP {e.code}: {err_body}")
            raise RuntimeError(f"Anthropic API error (HTTP {e.code}): {err_body}")
        except Exception as e:
            logger.error(f"[ANTHROPIC Request Failed]: {e}")
            raise RuntimeError(f"Anthropic connection failure: {e}")

    def _call_gemini(self, prompt_text: str) -> LLMResponse:
        candidate_models = ["gemini-3.5-flash-lite", self.model, "gemini-3.5-flash", "gemini-3-flash-preview", "gemini-flash-lite-latest"]
        unique_models = []
        for m in candidate_models:
            if m not in unique_models:
                unique_models.append(m)

        last_error = None
        for current_model in unique_models:
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{current_model}:generateContent?key={self.api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt_text}]}],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 2048,
                    "responseMimeType": "application/json"
                }
            }
            req_data = json.dumps(payload).encode("utf-8")
            headers = {
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            }
            req = urllib.request.Request(endpoint, data=req_data, headers=headers)

            for attempt in range(2):
                try:
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        resp_json = json.loads(resp.read().decode("utf-8"))
                        text = resp_json["candidates"][0]["content"]["parts"][0]["text"]
                        return LLMResponse(text)
                except urllib.error.HTTPError as e:
                    err_body = e.read().decode("utf-8", errors="ignore")
                    last_error = f"HTTP {e.code}: {err_body[:160]}"
                    if e.code in (503, 429):
                        logger.warning(f"[Gemini 503/429] Model '{current_model}' busy (attempt {attempt + 1}). Trying alternative model...")
                        time.sleep(1.0)
                        continue
                    else:
                        break
                except Exception as e:
                    last_error = str(e)
                    time.sleep(1.0)
                    continue

        raise RuntimeError(f"Google Gemini connection failure: {last_error}")

    def _call_openai_compatible(self, prompt_text: str) -> LLMResponse:
        endpoint = "https://api.groq.com/openai/v1/chat/completions" if self.provider == "groq" else "https://api.openai.com/v1/chat/completions"
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a professional geospatial intelligence agent. Always output valid JSON conforming to the requested schema."},
                {"role": "user", "content": prompt_text}
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }
        req_data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
        req = urllib.request.Request(endpoint, data=req_data, headers=headers)

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_json = json.loads(resp.read().decode("utf-8"))
                text = resp_json["choices"][0]["message"]["content"]
                return LLMResponse(text)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            logger.error(f"[{self.provider.upper()} API Error] HTTP {e.code}: {err_body}")
            raise RuntimeError(f"{self.provider.upper()} API error (HTTP {e.code}): {err_body}")
        except Exception as e:
            logger.error(f"[{self.provider.upper()} Request Failed]: {e}")
            raise RuntimeError(f"{self.provider.upper()} connection failure: {e}")

    def _call_ollama(self, prompt_text: str) -> LLMResponse:
        endpoint = f"{self.ollama_url}/api/chat"
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt_text}],
            "stream": False,
            "format": "json"
        }
        req_data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
        req = urllib.request.Request(endpoint, data=req_data, headers=headers)

        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                resp_json = json.loads(resp.read().decode("utf-8"))
                text = resp_json.get("message", {}).get("content", "")
                return LLMResponse(text)
        except Exception as e:
            logger.error(f"[Ollama Request Failed]: {e}")
            raise RuntimeError(f"Ollama local service failure at {self.ollama_url}: {e}")
