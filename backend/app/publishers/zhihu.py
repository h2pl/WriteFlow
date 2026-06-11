"""Zhihu (知乎) publisher."""

import httpx
import markdown

from app.config import settings
from app.publishers.base import BasePublisher, PublishResult


class ZhihuPublisher(BasePublisher):
    """
    知乎专栏发布器。

    使用知乎的内部 API（需要 Cookie 认证）。
    """

    platform_name = "zhihu"

    BASE_URL = "https://zhuanlan.zhihu.com/api"

    def __init__(self):
        self.cookie = settings.ZHIHU_COOKIE

    def is_configured(self) -> bool:
        return bool(self.cookie)

    def _markdown_to_html(self, md_content: str) -> str:
        return markdown.markdown(
            md_content,
            extensions=["fenced_code", "tables", "codehilite"],
        )

    async def publish(self, title: str, content: str, **kwargs) -> PublishResult:
        if not self.is_configured():
            return PublishResult(
                success=False,
                platform=self.platform_name,
                error_message="Zhihu cookie not configured",
            )

        try:
            headers = {
                "Cookie": self.cookie,
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "x-requested-with": "XMLHttpRequest",
            }

            html_content = self._markdown_to_html(content)

            # Step 1: Create draft
            async with httpx.AsyncClient() as client:
                draft_resp = await client.post(
                    f"{self.BASE_URL}/articles/drafts",
                    headers=headers,
                    json={
                        "title": title,
                        "content": html_content,
                        "topic_url": "",
                    },
                )
                draft_data = draft_resp.json()

            draft_id = draft_data.get("id")
            if not draft_id:
                return PublishResult(
                    success=False,
                    platform=self.platform_name,
                    error_message=f"Zhihu draft error: {draft_data}",
                )

            # Step 2: Publish the draft
            async with httpx.AsyncClient() as client:
                pub_resp = await client.put(
                    f"{self.BASE_URL}/articles/{draft_id}/publish",
                    headers=headers,
                    json={
                        "column": kwargs.get("column", None),
                        "commentPermission": "anyone",
                    },
                )

            if pub_resp.status_code in (200, 201):
                return PublishResult(
                    success=True,
                    platform=self.platform_name,
                    platform_article_id=str(draft_id),
                    platform_url=f"https://zhuanlan.zhihu.com/p/{draft_id}",
                )
            else:
                return PublishResult(
                    success=False,
                    platform=self.platform_name,
                    error_message=f"Zhihu publish error: {pub_resp.status_code} {pub_resp.text}",
                )

        except Exception as e:
            return PublishResult(
                success=False,
                platform=self.platform_name,
                error_message=str(e),
            )
