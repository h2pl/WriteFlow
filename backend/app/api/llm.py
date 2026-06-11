"""LLM configuration API routes."""

from fastapi import APIRouter

from app.models.schemas import LLMProviderInfo
from app.services.llm_service import llm_service
from app.services.publish_service import publish_service

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/providers", response_model=list[LLMProviderInfo])
async def list_providers():
    providers = llm_service.list_providers()
    return [LLMProviderInfo(**p) for p in providers]


@router.get("/platforms")
async def list_platforms():
    return publish_service.get_available_platforms()
