"""Multi-model LLM service with unified interface."""

import time
from abc import ABC, abstractmethod
from typing import Optional

from app.config import settings


# --- Writing Prompts ---

STYLE_PROMPTS = {
    "tech_blog": "你是一位资深技术博主，擅长写深入浅出的技术博客文章。文章结构清晰，有代码示例，有实际应用场景。",
    "tutorial": "你是一位技术教程作者，擅长写手把手的教程。步骤清晰，循序渐进，适合初学者阅读。",
    "opinion": "你是一位技术评论员，擅长写有深度的技术观点文章。有独到见解，论据充分，引人思考。",
    "news": "你是一位科技记者，擅长写科技新闻和行业分析。信息准确，视角全面，时效性强。",
}

LENGTH_MAP = {
    "short": "文章字数控制在 800-1500 字。",
    "medium": "文章字数控制在 1500-3000 字。",
    "long": "文章字数控制在 3000-5000 字。",
}


def build_generation_prompt(
    topic: str,
    style: str = "tech_blog",
    language: str = "zh",
    length: str = "medium",
    extra_instructions: Optional[str] = None,
) -> str:
    lang_instruction = "请用中文撰写。" if language == "zh" else "Please write in English."
    style_prompt = STYLE_PROMPTS.get(style, STYLE_PROMPTS["tech_blog"])
    length_prompt = LENGTH_MAP.get(length, LENGTH_MAP["medium"])

    prompt = f"""{style_prompt}

请围绕以下主题撰写一篇高质量文章：

主题：{topic}

要求：
1. {lang_instruction}
2. {length_prompt}
3. 文章需要有清晰的标题（用 Markdown # 格式）。
4. 使用 Markdown 格式，包含适当的小标题、列表和代码块。
5. 内容要有深度，不要泛泛而谈。
6. 开头要吸引人，结尾要有总结。"""

    if extra_instructions:
        prompt += f"\n7. 额外要求：{extra_instructions}"

    return prompt


class BaseLLMProvider(ABC):
    """Base class for LLM providers."""

    @abstractmethod
    async def generate(self, prompt: str, model: Optional[str] = None) -> str:
        """Generate text from prompt."""
        ...

    @abstractmethod
    def is_configured(self) -> bool:
        """Check if this provider has valid credentials."""
        ...

    @abstractmethod
    def get_models(self) -> list[str]:
        """List available models."""
        ...


class OpenAIProvider(BaseLLMProvider):
    """OpenAI-compatible provider (also works for DeepSeek and other OpenAI-compatible APIs)."""

    def __init__(self, api_key: str, base_url: Optional[str] = None, default_model: str = "gpt-4o"):
        self.api_key = api_key
        self.base_url = base_url
        self.default_model = default_model

    async def generate(self, prompt: str, model: Optional[str] = None) -> str:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self.api_key, base_url=self.base_url)
        response = await client.chat.completions.create(
            model=model or self.default_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=8000,
        )
        return response.choices[0].message.content

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def get_models(self) -> list[str]:
        return [self.default_model]


class AnthropicProvider(BaseLLMProvider):
    """Anthropic Claude provider."""

    def __init__(self, api_key: str, default_model: str = "claude-sonnet-4-20250514"):
        self.api_key = api_key
        self.default_model = default_model

    async def generate(self, prompt: str, model: Optional[str] = None) -> str:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=self.api_key)
        response = await client.messages.create(
            model=model or self.default_model,
            max_tokens=8000,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def get_models(self) -> list[str]:
        return [self.default_model]


class DeepSeekProvider(OpenAIProvider):
    """DeepSeek provider (OpenAI-compatible)."""

    def __init__(self, api_key: str, base_url: str = "https://api.deepseek.com", default_model: str = "deepseek-chat"):
        super().__init__(api_key=api_key, base_url=base_url, default_model=default_model)


class LLMService:
    """Unified LLM service managing multiple providers."""

    def __init__(self):
        self.providers: dict[str, BaseLLMProvider] = {}
        self._init_providers()

    def _init_providers(self):
        if settings.OPENAI_API_KEY:
            self.providers["openai"] = OpenAIProvider(
                api_key=settings.OPENAI_API_KEY,
                base_url=settings.OPENAI_BASE_URL,
                default_model=settings.OPENAI_MODEL,
            )
        if settings.ANTHROPIC_API_KEY:
            self.providers["anthropic"] = AnthropicProvider(
                api_key=settings.ANTHROPIC_API_KEY,
                default_model=settings.ANTHROPIC_MODEL,
            )
        if settings.DEEPSEEK_API_KEY:
            self.providers["deepseek"] = DeepSeekProvider(
                api_key=settings.DEEPSEEK_API_KEY,
                base_url=settings.DEEPSEEK_BASE_URL,
                default_model=settings.DEEPSEEK_MODEL,
            )

    def get_provider(self, name: Optional[str] = None) -> BaseLLMProvider:
        provider_name = name or settings.DEFAULT_LLM_PROVIDER
        if provider_name not in self.providers:
            available = list(self.providers.keys())
            if not available:
                raise ValueError("No LLM providers configured. Please set API keys in .env file.")
            # Fallback to first available
            provider_name = available[0]
        return self.providers[provider_name]

    def list_providers(self) -> list[dict]:
        all_providers = [
            ("openai", "OpenAI", ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]),
            ("anthropic", "Anthropic Claude", ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"]),
            ("deepseek", "DeepSeek", ["deepseek-chat", "deepseek-reasoner"]),
        ]
        result = []
        for name, display_name, models in all_providers:
            result.append({
                "name": name,
                "display_name": display_name,
                "models": models,
                "is_configured": name in self.providers,
            })
        return result

    async def generate_article(
        self,
        topic: str,
        style: str = "tech_blog",
        language: str = "zh",
        length: str = "medium",
        provider: Optional[str] = None,
        model: Optional[str] = None,
        extra_instructions: Optional[str] = None,
    ) -> dict:
        prompt = build_generation_prompt(topic, style, language, length, extra_instructions)
        llm = self.get_provider(provider)

        start = time.time()
        content = await llm.generate(prompt, model)
        elapsed = time.time() - start

        # Extract title from generated content
        title = topic
        lines = content.strip().split("\n")
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("# "):
                title = stripped[2:].strip()
                break

        return {
            "title": title,
            "content": content,
            "prompt": prompt,
            "provider": provider or settings.DEFAULT_LLM_PROVIDER,
            "model": model or llm.default_model,
            "generation_time": elapsed,
        }


# Singleton
llm_service = LLMService()
