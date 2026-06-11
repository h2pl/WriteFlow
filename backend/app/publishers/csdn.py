"""CSDN publisher."""

import httpx

from app.config import settings
from app.publishers.base import BasePublisher, PublishResult


class CSDNPublisher(BasePublisher):
    """
    CSDN 发布器。

    使用 CSDN 的内部 API（需要 Cookie 认证）。
    """

    platform_name = "csdn"

    BASE_URL = "https://blog-console-api.csdn.net/v1"

    def __init__(self):
        self.cookie = settings.CSDN_COOKIE

    def is_configured(self) -> bool:
        return bool(self.cookie)

    async def publish(self, title: str, content: str, **kwargs) -> PublishResult:
        if not self.is_configured():
            return PublishResult(
                success=False,
                platform=self.platform_name,
                error_message="CSDN cookie not configured",
            )

        try:
            headers = {
                "Cookie": self.cookie,
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }

            tags = kwargs.get("tags", "")
            tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

            payload = {
                "title": title,
                "markdowncontent": content,
                "content": content,
                "readType": "public",
                "type": "original",
                "categories": kwargs.get("category", ""),
                "tags": ",".join(tag_list[:5]),  # CSDN max 5 tags
                "status": 0,  # 0 = publish
                "description": kwargs.get("summary", ""),
                "cover_images": [],
                "not_auto_saved": 1,
                "source": "pc_mdeditor",
            }

            if kwargs.get("cover_image"):
                payload["cover_images"] = [kwargs["cover_image"]]
                payload["cover_type"] = 1

            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.BASE_URL}/article/saveArticle",
                    headers=headers,
                    json=payload,
                )
                data = resp.json()

            if data.get("code") == 200 and data.get("data"):
                article_id = data["data"].get("id") or data["data"].get("url", "")
                article_url = data["data"].get("url", f"https://blog.csdn.net/article/details/{article_id}")
                return PublishResult(
                    success=True,
                    platform=self.platform_name,
                    platform_article_id=str(article_id),
                    platform_url=article_url,
                )
            else:
                return PublishResult(
                    success=False,
                    platform=self.platform_name,
                    error_message=f"CSDN API error: {data}",
                )

        except Exception as e:
            return PublishResult(
                success=False,
                platform=self.platform_name,
                error_message=str(e),
            )
