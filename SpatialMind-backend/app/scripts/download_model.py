from transformers import AutoModelForCausalLM, AutoTokenizer
from app.core.config import settings

model_name = "facebook/opt-350m"

# Pre-download the model and tokenizer to cache using Hugging Face token
print("⏬ Downloading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(model_name, token=settings.HUGGINGFACE_HUB_TOKEN)

print("⏬ Downloading model...")
model = AutoModelForCausalLM.from_pretrained(model_name, token=settings.HUGGINGFACE_HUB_TOKEN)

print("✅ Model downloaded and cached successfully!")
