"""WeChat Official Account publisher - draft mode for subscription accounts."""

import hashlib
import re
import time
from typing import Optional
from urllib.parse import quote

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

    async def _search_cover_image(self, title: str, content: str) -> Optional[bytes]:
        """
        Search the web for a topic-matching cover image and return its raw bytes.

        Strategy (tried in order, all API-key-free):
          1. Unsplash Source — image-by-keyword endpoint, returns a JPEG.
          2. Picsum (with seeded hash of the title) — deterministic fallback.
        Returns None if all attempts fail.
        """
        keyword = re.sub(r"[^\w\s\u4e00-\u9fff-]", "", title).strip()[:60]
        if not keyword:
            keyword = "article"

        urls_to_try = [
            f"https://source.unsplash.com/featured/?{quote(keyword)}",
            f"https://picsum.photos/seed/{hashlib.md5(keyword.encode('utf-8')).hexdigest()[:10]}/1280/720",
        ]

        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            for url in urls_to_try:
                try:
                    resp = await client.get(url)
                    if resp.status_code == 200 and len(resp.content) > 1024:
                        return resp.content
                except Exception:
                    continue
        return None

    async def _upload_image(self, access_token: str, image_url: str) -> str:
        """Upload an image to WeChat as a permanent material and return media_id.

        WeChat draft/add requires thumb_media_id, which must be a *permanent*
        material (obtained from /cgi-bin/material/add_material), NOT a
        temporary one (/cgi-bin/media/upload).
        """
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
                f"{self.BASE_URL}/material/add_material",
                params={"access_token": access_token, "type": "image"},
                files={"media": ("cover.jpg", img_data, content_type)},
            )
            data = resp.json()

        if "media_id" not in data:
            raise ValueError(f"Failed to upload permanent image material: {data}")
        return data["media_id"]

    async def _upload_image_bytes(self, access_token: str, image_bytes: bytes, filename: str = "cover.jpg") -> str:
        """Upload raw image bytes as a permanent material. Used for web-searched covers."""
        async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
            resp = await client.post(
                f"{self.BASE_URL}/material/add_material",
                params={"access_token": access_token, "type": "image"},
                files={"media": (filename, image_bytes, "image/jpeg")},
            )
            data = resp.json()

        if "media_id" not in data:
            raise ValueError(f"Failed to upload permanent image material: {data}")
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

            # WeChat draft/add requires a non-empty thumb_media_id (permanent material).
            # Resolution order:
            #   1. caller-supplied thumb_media_id (skip upload)
            #   2. caller-supplied cover_image URL → upload to permanent material library
            #   3. AUTO: search the web for a topic-matching image → upload → use that
            thumb_media_id = kwargs.get("thumb_media_id", "") or ""
            if not thumb_media_id:
                cover_image = kwargs.get("cover_image")
                if not cover_image:
                    # Auto-fetch: search the web for a topic-matching cover
                    try:
                        image_bytes = await self._search_cover_image(title, content)
                    except Exception as e:
                        return PublishResult(
                            success=False,
                            platform=self.platform_name,
                            error_message=(
                                f"WeChat draft requires a cover image and auto-search failed: {e}. "
                                f"Please set `cover_image` on the article and retry."
                            ),
                        )
                    if not image_bytes:
                        return PublishResult(
                            success=False,
                            platform=self.platform_name,
                            error_message=(
                                "WeChat draft requires a cover image and could not auto-fetch one "
                                "from the web. Please set `cover_image` on the article and retry."
                            ),
                        )
                    try:
                        thumb_media_id = await self._upload_image_bytes(access_token, image_bytes)
                    except Exception as e:
                        return PublishResult(
                            success=False,
                            platform=self.platform_name,
                            error_message=f"Failed to upload auto-fetched cover: {e}",
                        )
                else:
                    try:
                        thumb_media_id = await self._upload_image(access_token, cover_image)
                    except Exception as e:
                        return PublishResult(
                            success=False,
                            platform=self.platform_name,
                            error_message=f"Failed to upload cover image: {e}",
                        )

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
