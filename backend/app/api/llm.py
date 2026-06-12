"""LLM configuration API routes."""

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.config import BASE_DIR, settings
from app.models.schemas import LLMProviderInfo, PlatformInfo
from app.services.llm_service import llm_service
from app.services.publish_service import publish_service

router = APIRouter(prefix="/llm", tags=["llm"])

ENV_PATH = BASE_DIR / ".env"


@router.get("/providers", response_model=list[LLMProviderInfo])
async def list_providers():
    providers = llm_service.list_providers()
    return [LLMProviderInfo(**p) for p in providers]


@router.get("/platforms", response_model=list[PlatformInfo])
async def list_platforms():
    platforms = publish_service.get_available_platforms()
    return [PlatformInfo(**p) for p in platforms]


@router.get("/models/{provider_name}")
async def fetch_provider_models(provider_name: str):
    """Fetch available models from a provider's API in real-time."""
    try:
        models = await llm_service.fetch_models_for_provider(provider_name)
        return {"provider": provider_name, "models": models}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch models: {str(e)}")


class SettingsUpdate(BaseModel):
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_BASE_URL: Optional[str] = None
    OPENAI_MODEL: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: Optional[str] = None
    DEEPSEEK_API_KEY: Optional[str] = None
    DEEPSEEK_BASE_URL: Optional[str] = None
    DEEPSEEK_MODEL: Optional[str] = None
    DEFAULT_LLM_PROVIDER: Optional[str] = None
    WECHAT_APP_ID: Optional[str] = None
    WECHAT_APP_SECRET: Optional[str] = None
    JUEJIN_COOKIE: Optional[str] = None
    CSDN_COOKIE: Optional[str] = None
    ZHIHU_COOKIE: Optional[str] = None


def _mask_value(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    if len(value) <= 8:
        return "****"
    return value[:4] + "****" + value[-4:]


@router.get("/settings")
async def get_settings():
    return {
        "OPENAI_API_KEY": _mask_value(settings.OPENAI_API_KEY),
        "OPENAI_BASE_URL": settings.OPENAI_BASE_URL,
        "OPENAI_MODEL": settings.OPENAI_MODEL,
        "ANTHROPIC_API_KEY": _mask_value(settings.ANTHROPIC_API_KEY),
        "ANTHROPIC_MODEL": settings.ANTHROPIC_MODEL,
        "DEEPSEEK_API_KEY": _mask_value(settings.DEEPSEEK_API_KEY),
        "DEEPSEEK_BASE_URL": settings.DEEPSEEK_BASE_URL,
        "DEEPSEEK_MODEL": settings.DEEPSEEK_MODEL,
        "DEFAULT_LLM_PROVIDER": settings.DEFAULT_LLM_PROVIDER,
        "WECHAT_APP_ID": _mask_value(settings.WECHAT_APP_ID),
        "WECHAT_APP_SECRET": _mask_value(settings.WECHAT_APP_SECRET),
        "JUEJIN_COOKIE": _mask_value(settings.JUEJIN_COOKIE),
        "CSDN_COOKIE": _mask_value(settings.CSDN_COOKIE),
        "ZHIHU_COOKIE": _mask_value(settings.ZHIHU_COOKIE),
    }


def _persist_to_env(updates: dict) -> None:
    """Write the given key=value pairs to the .env file, preserving comments and order."""
    if not updates:
        return

    lines: list[str] = []
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()

    # Track which keys we have updated so we can append new ones at the end
    keys_written: set[str] = set()
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        # Match KEY=... (allow leading whitespace, ignore comments)
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in updates:
                new_lines.append(f"{key}={updates[key]}")
                keys_written.add(key)
                continue
        new_lines.append(line)

    # Append keys that didn't exist in the file
    for key, value in updates.items():
        if key not in keys_written:
            new_lines.append(f"{key}={value}")

    ENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


@router.put("/settings")
async def update_settings(data: SettingsUpdate):
    raw_updates = data.model_dump(exclude_unset=True)
    updates: dict[str, str] = {}
    updated: list[str] = []

    for field, value in raw_updates.items():
        # Skip masked placeholders (e.g. "abcd****wxyz") so we don't overwrite
        # a real key with a masked value echoed back from the frontend.
        if value is None:
            continue
        if isinstance(value, str) and "****" in value:
            continue
        if value == "":
            continue
        setattr(settings, field, value)
        updates[field] = value
        updated.append(field)

    if updates:
        try:
            _persist_to_env(updates)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to persist settings to .env: {e}",
            )

    # Re-init LLM providers and publishers so the new keys take effect
    llm_service._init_providers()
    for pub in publish_service.publishers.values():
        pub.__init__()

    return {
        "message": f"Updated: {', '.join(updated) if updated else 'nothing'}",
        "persisted_to": str(ENV_PATH),
        "note": "Changes saved to .env and take effect immediately.",
    }
