"""Pydantic schemas for API request/response."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# --- Article Schemas ---

class ArticleCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    content: Optional[str] = ""
    summary: Optional[str] = None
    tags: Optional[str] = None
    category: Optional[str] = None
    cover_image: Optional[str] = None


class ArticleUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    content: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[str] = None
    category: Optional[str] = None
    cover_image: Optional[str] = None
    cover_mode: Optional[str] = Field(None, description="封面策略: manual, search, ai")
    status: Optional[str] = None


class ArticleResponse(BaseModel):
    id: int
    title: str
    content: str
    summary: Optional[str]
    tags: Optional[str]
    category: Optional[str]
    cover_image: Optional[str]
    cover_mode: Optional[str]
    llm_provider: Optional[str]
    llm_model: Optional[str]
    prompt: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ArticleListResponse(BaseModel):
    items: list[ArticleResponse]
    total: int
    page: int
    page_size: int


# --- AI Generation Schemas ---

class GenerateRequest(BaseModel):
    topic: str = Field(..., description="写作主题")
    style: Optional[str] = Field("tech_blog", description="写作风格: tech_blog, tutorial, opinion, news")
    language: Optional[str] = Field("zh", description="语言: zh, en")
    length: Optional[str] = Field("medium", description="长度: short, medium, long")
    provider: Optional[str] = Field(None, description="LLM 提供商: openai, anthropic, deepseek")
    model: Optional[str] = Field(None, description="具体模型名")
    extra_instructions: Optional[str] = Field(None, description="额外写作指令")


class GenerateResponse(BaseModel):
    article: ArticleResponse
    generation_time: float


# --- Publish Schemas ---

class PublishRequest(BaseModel):
    article_id: int
    platforms: list[str] = Field(..., description="发布平台列表: wechat, juejin, csdn, zhihu")


class PublishRecordResponse(BaseModel):
    id: int
    article_id: int
    platform: str
    platform_article_id: Optional[str]
    platform_url: Optional[str]
    status: str
    error_message: Optional[str]
    published_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


# --- LLM Config Schemas ---

class LLMProviderInfo(BaseModel):
    name: str
    display_name: str
    models: list[str]
    is_configured: bool
    default_model: Optional[str] = None


class PlatformConfigField(BaseModel):
    key: str
    label: str
    type: str = "text"  # text, password
    placeholder: str = ""
    description: Optional[str] = None


class PlatformInfo(BaseModel):
    name: str
    display_name: str
    is_configured: bool
    config_fields: list[PlatformConfigField] = []
