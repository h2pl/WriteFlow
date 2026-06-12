"""WeChat Official Account publisher - draft mode for subscription accounts."""

import hashlib
import time
from typing import Optional

import httpx
import markdown

from app.config import settings
from app.publishers.base import BasePublisher, PublishResult


class WeChatPublisher(BasePublisher):
    """
    微信公众号发布器（订阅号草稿模式）。

    流程：
    1. 获取 access_token
    2. 将 Markdown 转为 HTML
    3. 上传文章素材（草稿）
    4. 用户手动在公众号后台发布
    """

    platform_name = "wechat"

    BASE_URL = "https://api.weixin.qq.com/cgi-bin"
    TIMEOUT = 30

    def __init__(self):
        self.app_id = settings.WECHAT_APP_ID
        self.app_secret = settings.WECHAT_APP_SECRET
        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0

    def is_configured(self) -> bool:
        return bool(self.app_id and self.app_secret)

    async def _get_access_token(self) -> str:
        if self._access_token and time.time() < self._token_expires_at:
            return self._access_token

        async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
            resp = await client.get(
                f"{self.BASE_URL}/token",
                params={
                    "grant_type": "client_credential",
                    "appid": self.app_id,
                    "secret": self.app_secret,
                },
            )
            data = resp.json()

        if "access_token" not in data:
            raise ValueError(f"Failed to get access token: {data}")

        self._access_token = data["access_token"]
        self._token_expires_at = time.time() + data.get("expires_in", 7200) - 300
        return self._access_token

    def _markdown_to_html(self, md_content: str) -> str:
        """Convert Markdown to WeChat-compatible HTML."""
        html = markdown.markdown(
            md_content,
            extensions=["fenced_code", "tables", "codehilite", "toc"],
        )
        # Wrap in basic styling for WeChat
        styled_html = f"""<div style="font-size: 16px; line-height: 1.8; color: #333;">
{html}
</div>"""
        return styled_html

    async def _upload_image(self, access_token: str, image_url: str) -> str:
        """Upload an image to WeChat and return media_id."""
        async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
            if image_url.startswith("http"):
                img_resp = await client.get(image_url, timeout=30)
                img_data = img_resp.content
                content_type = img_resp.headers.get("content-type", "image/jpeg")
            else:
                import base64
                img_data = base64.b64decode(image_url)
                content_type = "image/jpeg"

            resp = await client.post(
                f"{self.BASE_URL}/media/upload",
                params={"access_token": access_token, "type": "image"},
                files={"media": ("cover.jpg", img_data, content_type)},
            )
            data = resp.json()

        if "media_id" not in data:
            raise ValueError(f"Failed to upload image: {data}")
        return data["media_id"]

    async def publish(self, title: str, content: str, **kwargs) -> PublishResult:
        if not self.is_configured():
            return PublishResult(
                success=False,
                platform=self.platform_name,
                error_message="WeChat credentials not configured",
            )

        try:
            access_token = await self._get_access_token()
            html_content = self._markdown_to_html(content)

            # Upload cover image for thumb_media_id (required by WeChat)
            thumb_media_id = kwargs.get("thumb_media_id", "")
            cover_image = kwargs.get("cover_image")
            if not thumb_media_id and cover_image:
                try:
                    thumb_media_id = await self._upload_image(access_token, cover_image)
                except Exception:
                    thumb_media_id = ""

            # Add draft via the draft API
            async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/draft/add",
                    params={"access_token": access_token},
                    json={
                        "articles": [
                            {
                                "title": title,
                                "author": kwargs.get("author", "WriteFlow"),
                                "content": html_content,
                                "digest": kwargs.get("summary", ""),
                                "content_source_url": kwargs.get("source_url", ""),
                                "thumb_media_id": thumb_media_id,
                                "need_open_comment": 0,
                            }
                        ]
                    },
                )
                data = resp.json()

            if "media_id" in data:
                return PublishResult(
                    success=True,
                    platform=self.platform_name,
                    platform_article_id=data["media_id"],
                    platform_url=None,  # Draft has no public URL yet
                )
            else:
                return PublishResult(
                    success=False,
                    platform=self.platform_name,
                    error_message=f"WeChat API error: {data}",
                )

        except Exception as e:
            return PublishResult(
                success=False,
                platform=self.platform_name,
                error_message=str(e),
            )
