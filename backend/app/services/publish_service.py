"""Publish service - orchestrates publishing to multiple platforms."""

from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
