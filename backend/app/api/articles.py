"""Article API routes."""

import base64
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.article import Article, ArticleStatus
from app.models.schemas import (
    ArticleCreate,
    ArticleListResponse,
    ArticleResponse,
    ArticleUpdate,
    GenerateRequest,
    GenerateResponse,
    PublishRecordResponse,
    PublishRequest,
)
from app.services.llm_service import llm_service, build_generation_prompt
from app.services.publish_service import publish_service

router = APIRouter(prefix="/articles", tags=["articles"])


@router.get("", response_model=ArticleListResponse)
async def list_articles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Article).order_by(Article.created_at.desc())
    count_query = select(func.count(Article.id))

    if status:
        query = query.where(Article.status == status)
        count_query = count_query.where(Article.status == status)

    if search:
        search_filter = (
            Article.title.ilike(f"%{search}%")
            | Article.content.ilike(f"%{search}%")
            | Article.tags.ilike(f"%{search}%")
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total = (await db.execute(count_query)).scalar() or 0
    result = await db.execute(query.offset((page - 1) * page_size).limit(page_size))
    articles = list(result.scalars().all())

    return ArticleListResponse(
        items=[ArticleResponse.model_validate(a) for a in articles],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ArticleResponse, status_code=201)
async def create_article(
    data: ArticleCreate,
    db: AsyncSession = Depends(get_db),
):
    article = Article(**data.model_dump())
    db.add(article)
    await db.flush()
    await db.refresh(article)
    return ArticleResponse.model_validate(article)


@router.get("/{article_id}", response_model=ArticleResponse)
async def get_article(article_id: int, db: AsyncSession = Depends(get_db)):
    article = await db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return ArticleResponse.model_validate(article)


@router.put("/{article_id}", response_model=ArticleResponse)
async def update_article(
    article_id: int,
    data: ArticleUpdate,
    db: AsyncSession = Depends(get_db),
):
    article = await db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(article, field, value)

    await db.flush()
    await db.refresh(article)
    return ArticleResponse.model_validate(article)


@router.delete("/{article_id}", status_code=204)
async def delete_article(article_id: int, db: AsyncSession = Depends(get_db)):
    article = await db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    await db.delete(article)


class BatchDeleteRequest(BaseModel):
    ids: list[int]


@router.post("/batch-delete", status_code=200)
async def batch_delete_articles(
    data: BatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    deleted = 0
    missing: list[int] = []
    for aid in data.ids:
        article = await db.get(Article, aid)
        if not article:
            missing.append(aid)
            continue
        await db.delete(article)
        deleted += 1
    return {"deleted": deleted, "missing": missing}


class CoverFetchRequest(BaseModel):
    mode: str = Field(..., description="封面模式: search | ai | manual")


@router.post("/{article_id}/cover-fetch", response_model=ArticleResponse)
async def fetch_cover(
    article_id: int,
    data: CoverFetchRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate / fetch a cover image for the article based on the requested mode.

    - 'search' — pull a topic-matching image from the web (Wikimedia → Picsum)
    - 'ai'     — generate a cover with DALL-E 3 (requires OPENAI_API_KEY)
    - 'manual' — no-op: caller should PATCH the cover_image URL via PUT /{id}

    The resulting image is stored as a base64 data URL in `cover_image` and
    `cover_mode` is updated to reflect the source.

    All exceptions are caught and returned as HTTP 500 with a descriptive
    `detail` so the frontend can surface the real reason to the user.
    """
    from app.services.cover_service import ai_generate_cover_image, search_cover_image
    import logging
    logger = logging.getLogger(__name__)

    article = await db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")

    mode = data.mode
    if mode not in ("search", "ai", "manual"):
        raise HTTPException(status_code=400, detail=f"无效的封面模式: {mode}")

    try:
        if mode == "manual":
            # Manual mode just records the choice; the URL is set by the frontend via PUT
            article.cover_mode = "manual"
        elif mode == "search":
            image_bytes = await search_cover_image(article.title, article.content or "")
            if not image_bytes:
                raise HTTPException(
                    status_code=502,
                    detail="自动搜图失败：Wikimedia Commons 和 Picsum 都无法返回图片，请检查网络后重试。",
                )
            b64 = base64.b64encode(image_bytes).decode("ascii")
            article.cover_image = f"data:image/jpeg;base64,{b64}"
            article.cover_mode = "search"
        elif mode == "ai":
            try:
                image_bytes = await ai_generate_cover_image(article.title, article.content or "")
            except RuntimeError as exc:
                # ai_generate_cover_image raises RuntimeError with a descriptive
                # message — surface it to the user
                raise HTTPException(
                    status_code=502,
                    detail=f"AI 生成封面失败：{exc}",
                )
            if not image_bytes:
                raise HTTPException(
                    status_code=502,
                    detail="AI 生成封面失败：未配置 OPENAI_API_KEY。请到 设置 → LLM 配置 中配置。",
                )
            b64 = base64.b64encode(image_bytes).decode("ascii")
            article.cover_image = f"data:image/png;base64,{b64}"
            article.cover_mode = "ai"
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("fetch_cover generation failed")
        raise HTTPException(
            status_code=500,
            detail=f"封面生成异常 ({mode}): {type(exc).__name__}: {str(exc)[:300]}",
        )

    try:
        await db.commit()
        await db.refresh(article)
    except Exception as exc:
        logger.exception("db commit failed in fetch_cover")
        raise HTTPException(
            status_code=500,
            detail=f"封面已生成但保存到数据库失败: {type(exc).__name__}: {str(exc)[:200]}",
        )

    return ArticleResponse.model_validate(article)


@router.post("/generate", response_model=GenerateResponse)
async def generate_article(
    data: GenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await llm_service.generate_article(
            topic=data.topic,
            style=data.style,
            language=data.language,
            length=data.length,
            provider=data.provider,
            model=data.model,
            extra_instructions=data.extra_instructions,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    article = Article(
        title=result["title"],
        content=result["content"],
        prompt=result["prompt"],
        llm_provider=result["provider"],
        llm_model=result["model"],
        status=ArticleStatus.GENERATED,
    )
    db.add(article)
    await db.flush()
    await db.refresh(article)

    return GenerateResponse(
        article=ArticleResponse.model_validate(article),
        generation_time=result["generation_time"],
    )


@router.post("/{article_id}/publish", response_model=list[PublishRecordResponse])
async def publish_article(
    article_id: int,
    data: PublishRequest,
    db: AsyncSession = Depends(get_db),
):
    article = await db.get(Article, article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    records = await publish_service.publish_article(db, article, data.platforms)

    # Update article status
    all_success = all(r.status == "success" for r in records)
    any_success = any(r.status == "success" for r in records)

    if all_success:
        article.status = ArticleStatus.PUBLISHED
    elif any_success:
        article.status = ArticleStatus.PUBLISHED  # Partial success
    else:
        article.status = ArticleStatus.FAILED

    return [PublishRecordResponse.model_validate(r) for r in records]


@router.get("/{article_id}/publish-records", response_model=list[PublishRecordResponse])
async def get_publish_records(
    article_id: int,
    db: AsyncSession = Depends(get_db),
):
    records = await publish_service.get_publish_records(db, article_id)
    return [PublishRecordResponse.model_validate(r) for r in records]


@router.post("/generate-stream")
async def generate_article_stream(
    data: GenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """SSE streaming article generation."""
    try:
        provider = llm_service.get_provider(data.provider)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    prompt = build_generation_prompt(
        data.topic, data.style, data.language, data.length, data.extra_instructions
    )
    model_name = data.model or provider.default_model
    provider_name = data.provider or next(
        (name for name in llm_service.providers if llm_service.providers[name] is provider), "unknown"
    )

    async def event_generator():
        full_content = ""
        try:
            async for chunk in provider.generate_stream(prompt, model_name):
                full_content += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"

            # Extract title
            title = data.topic
            for line in full_content.strip().split("\n"):
                stripped = line.strip()
                if stripped.startswith("# "):
                    title = stripped[2:].strip()
                    break

            # Save article
            article = Article(
                title=title,
                content=full_content,
                prompt=prompt,
                llm_provider=provider_name,
                llm_model=model_name,
                status=ArticleStatus.GENERATED,
            )
            db.add(article)
            await db.flush()
            await db.refresh(article)

            yield f"data: {json.dumps({'type': 'done', 'article': ArticleResponse.model_validate(article).model_dump(mode='json')})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
