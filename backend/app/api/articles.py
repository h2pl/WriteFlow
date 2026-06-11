"""Article API routes."""

from fastapi import APIRouter, Depends, HTTPException, Query
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
from app.services.llm_service import llm_service
from app.services.publish_service import publish_service

router = APIRouter(prefix="/articles", tags=["articles"])


@router.get("", response_model=ArticleListResponse)
async def list_articles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Article).order_by(Article.created_at.desc())
    count_query = select(func.count(Article.id))

    if status:
        query = query.where(Article.status == status)
        count_query = count_query.where(Article.status == status)

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
