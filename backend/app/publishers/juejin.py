"""Juejin (掘金) publisher."""

import httpx

from app.config import settings
from app.publishers.base import BasePublisher, PublishResult


class JuejinPublisher(BasePublisher):
    """
    掘金发布器。

    使用掘金的内部 API（需要 Cookie 认证）。
    """

    platform_name = "juejin"

    BASE_URL = "https://api.juejin.cn/content_api/v1"

    def __init__(self):
        self.cookie = settings.JUEJIN_COOKIE

    def is_configured(self) -> bool:
        return bool(self.cookie)

    async def publish(self, title: str, content: str, **kwargs) -> PublishResult:
        if not self.is_configured():
            return PublishResult(
                success=False,
                platform=self.platform_name,
                error_message="Juejin cookie not configured",
            )

        try:
            headers = {
                "Cookie": self.cookie,
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }

            # Step 1: Create draft
            async with httpx.AsyncClient() as client:
                draft_resp = await client.post(
                    f"{self.BASE_URL}/article/draft",
                    headers=headers,
                    json={
                        "title": title,
                        "mark_content": content,
                        "category_id": kwargs.get("category_id", "6809637767543259144"),  # 默认后端
                        "tag_ids": kwargs.get("tag_ids", []),
                        "brief_content": kwargs.get("summary", ""),
                        "cover_image": kwargs.get("cover_image", ""),
                    },
                )
                draft_data = draft_resp.json()

            if draft_data.get("err_no") != 0:
                return PublishResult(
                    success=False,
                    platform=self.platform_name,
                    error_message=f"Juejin draft error: {draft_data}",
                )

            draft_id = draft_data["data"]["id"]

            # Step 2: Publish the draft
            async with httpx.AsyncClient() as client:
                pub_resp = await client.post(
                    f"{self.BASE_URL}/article/publish",
                    headers=headers,
                    json={
                        "draft_id": draft_id,
                        "column_ids": [],
                    },
                )
                pub_data = pub_resp.json()

            if pub_data.get("err_no") != 0:
                return PublishResult(
                    success=False,
                    platform=self.platform_name,
                    error_message=f"Juejin publish error: {pub_data}",
                )

            article_id = pub_data["data"]["article_id"]
            return PublishResult(
                success=True,
                platform=self.platform_name,
                platform_article_id=article_id,
                platform_url=f"https://juejin.cn/post/{article_id}",
            )

        except Exception as e:
            return PublishResult(
                success=False,
                platform=self.platform_name,
                error_message=str(e),
            )
