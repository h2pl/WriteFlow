"""Publish service - orchestrates publishing to multiple platforms."""

import asyncio
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.article import Article, PublishRecord
from app.publishers.base import BasePublisher, PublishResult
from app.publishers.csdn import CSDNPublisher
from app.publishers.juejin import JuejinPublisher
from app.publishers.wechat import WeChatPublisher
from app.publishers.zhihu import ZhihuPublisher


class PublishService:
    """Service for publishing articles to various platforms."""

    def __init__(self):
        self.publishers: dict[str, BasePublisher] = {
            "wechat": WeChatPublisher(),
            "juejin": JuejinPublisher(),
            "csdn": CSDNPublisher(),
            "zhihu": ZhihuPublisher(),
        }

    def get_available_platforms(self) -> list[dict]:
        return [
            {
                "name": name,
                "is_configured": pub.is_configured(),
            }
            for name, pub in self.publishers.items()
        ]

    async def publish_article(
        self,
        db: AsyncSession,
        article: Article,
        platforms: list[str],
    ) -> list[PublishRecord]:
        """Create pending records and start publishing in background."""
        records = []

        for platform_name in platforms:
            publisher = self.publishers.get(platform_name)
            if not publisher:
                record = PublishRecord(
                    article_id=article.id,
                    platform=platform_name,
                    status="failed",
                    error_message=f"Unknown platform: {platform_name}",
                )
                db.add(record)
                records.append(record)
                continue

            if not publisher.is_configured():
                record = PublishRecord(
                    article_id=article.id,
                    platform=platform_name,
                    status="failed",
                    error_message=f"{platform_name} is not configured",
                )
                db.add(record)
                records.append(record)
                continue

            # Create pending record
            record = PublishRecord(
                article_id=article.id,
                platform=platform_name,
                status="pending",
            )
            db.add(record)
            records.append(record)

        await db.flush()

        # Start background publishing
        record_ids = [r.id for r in records if r.status == "pending"]
        if record_ids:
            asyncio.create_task(
                self._publish_in_background(
                    article_id=article.id,
                    record_ids=record_ids,
                    title=article.title,
                    content=article.content,
                    summary=article.summary,
                    tags=article.tags,
                    category=article.category,
                    cover_image=article.cover_image,
                )
            )

        return records

    async def _publish_in_background(
        self,
        article_id: int,
        record_ids: list[int],
        title: str,
        content: str,
        summary: Optional[str],
        tags: Optional[str],
        category: Optional[str],
        cover_image: Optional[str],
    ):
        """Execute publishing in background for each platform."""
        async with async_session() as db:
            for record_id in record_ids:
                record = await db.get(PublishRecord, record_id)
                if not record:
                    continue

                publisher = self.publishers.get(record.platform)
                if not publisher:
                    continue

                try:
                    pub_result: PublishResult = await publisher.publish(
                        title=title,
                        content=content,
                        summary=summary,
                        tags=tags,
                        category=category,
                        cover_image=cover_image,
                    )
                    record.platform_article_id = pub_result.platform_article_id
                    record.platform_url = pub_result.platform_url
                    record.status = "success" if pub_result.success else "failed"
                    record.error_message = pub_result.error_message
                    record.published_at = datetime.utcnow() if pub_result.success else None
                except Exception as e:
                    record.status = "failed"
                    record.error_message = str(e)

                await db.commit()

    async def publish_article_sync(
        self,
        db: AsyncSession,
        article: Article,
        platforms: list[str],
    ) -> list[PublishRecord]:
        """Synchronous publish for MCP - waits for all results."""
        results = []

        for platform_name in platforms:
            publisher = self.publishers.get(platform_name)
            if not publisher:
                record = PublishRecord(
                    article_id=article.id,
                    platform=platform_name,
                    status="failed",
                    error_message=f"Unknown platform: {platform_name}",
                )
                db.add(record)
                results.append(record)
                continue

            if not publisher.is_configured():
                record = PublishRecord(
                    article_id=article.id,
                    platform=platform_name,
                    status="failed",
                    error_message=f"{platform_name} is not configured",
                )
                db.add(record)
                results.append(record)
                continue

            pub_result: PublishResult = await publisher.publish(
                title=article.title,
                content=article.content,
                summary=article.summary,
                tags=article.tags,
                category=article.category,
                cover_image=article.cover_image,
            )

            record = PublishRecord(
                article_id=article.id,
                platform=platform_name,
                platform_article_id=pub_result.platform_article_id,
                platform_url=pub_result.platform_url,
                status="success" if pub_result.success else "failed",
                error_message=pub_result.error_message,
                published_at=datetime.utcnow() if pub_result.success else None,
            )
            db.add(record)
            results.append(record)

        await db.flush()
        return results

    async def get_publish_records(
        self, db: AsyncSession, article_id: int
    ) -> list[PublishRecord]:
        result = await db.execute(
            select(PublishRecord).where(PublishRecord.article_id == article_id)
        )
        return list(result.scalars().all())


publish_service = PublishService()
