"""Cover image service with 3 strategies: manual, web search, AI generation."""

import base64
import hashlib
import random
import re
import time
from typing import Optional
from urllib.parse import quote

import httpx

from app.config import settings


# Common Chinese → English translations to make Wikimedia search effective
# for Chinese-only article titles. Not exhaustive — the goal is to land a
# reasonable English keyword for the public-domain image search.
_TOPIC_TRANSLATIONS = {
    "python": "python programming",
    "javascript": "javascript code",
    "typescript": "typescript code",
    "rust": "rust programming",
    "go": "golang programming",
    "java": "java programming",
    "ai": "artificial intelligence",
    "人工智能": "artificial intelligence",
    "机器学习": "machine learning",
    "深度学习": "deep learning",
    "前端": "web frontend",
    "后端": "server backend",
    "数据库": "database",
    "算法": "algorithm",
    "编程": "programming",
    "开发": "software development",
    "架构": "software architecture",
    "性能": "performance",
    "优化": "optimization",
    "测试": "software testing",
    "部署": "deployment",
    "运维": "devops",
    "网络": "computer network",
    "安全": "cybersecurity",
    "区块链": "blockchain",
    "云": "cloud computing",
    "容器": "docker container",
    "微服务": "microservice",
}


def _extract_keywords(title: str, content: str = "") -> str:
    """Extract a search keyword for image search.

    Strategy:
      1. If the title contains Latin words, use the first 3-5 meaningful words.
      2. Otherwise (pure Chinese), look for known Chinese → English topics.
      3. If nothing matches, fall back to a generic term.
    """
    title = (title or "").strip()
    content = (content or "").strip()

    # Look for known Chinese topics first
    for cn, en in _TOPIC_TRANSLATIONS.items():
        if cn in title.lower() or (content and cn in content.lower()[:200]):
            return en

    # Try to pull English / Latin words from title
    latin_words = re.findall(r"[A-Za-z][A-Za-z0-9+#.-]{2,}", title)
    if latin_words:
        return " ".join(latin_words[:3])

    # Last resort: Picsum doesn't care about topic, but Wikipedia does — use a generic
    return "technology"


async def _wikimedia_search(keyword: str) -> Optional[str]:
    """
    Search Wikimedia Commons for a public-domain image matching `keyword`.
    Returns the direct image URL (resized to 1280px wide) or None.

    To avoid returning the same image every time, we collect all valid
    image candidates from the search result, shuffle them, and pick one
    randomly. This makes the "换一张" feature actually useful.
    """
    search_url = "https://commons.wikimedia.org/w/api.php"
    params = {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": keyword,
        "srnamespace": "6",  # File namespace
        "srlimit": "20",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(search_url, params=params)
            data = resp.json()
        except Exception:
            return None

    hits = data.get("query", {}).get("search", [])
    # Filter out non-raster images
    image_exts = (".jpg", ".jpeg", ".png", ".webp")
    candidates = [
        h.get("title", "")
        for h in hits
        if any(h.get("title", "").lower().endswith(ext) for ext in image_exts)
    ]
    if not candidates:
        return None

    # Shuffle so repeated calls for the same keyword give different images
    random.shuffle(candidates)

    for title in candidates:
        info_url = "https://commons.wikimedia.org/w/api.php"
        info_params = {
            "action": "query",
            "format": "json",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url",
            "iiurlwidth": "1280",
        }
        try:
            info_resp = await client.get(info_url, params=info_params)
            info_data = info_resp.json()
            pages = info_data.get("query", {}).get("pages", {})
            for page in pages.values():
                imageinfo = page.get("imageinfo", [])
                if imageinfo:
                    url = imageinfo[0].get("thumburl") or imageinfo[0].get("url")
                    if url:
                        return url
        except Exception:
            continue
    return None


async def search_cover_image(title: str, content: str = "") -> Optional[bytes]:
    """
    Search the web for a topic-matching cover image. Returns raw bytes.

    Strategy (tried in order, all API-key-free):
      1. Wikimedia Commons — public-domain images, real topic matching
      2. Picsum — purely decorative fallback, randomised per call

    If both the search candidate and the download fail, we return None
    and let the caller raise an HTTP 502 with a clear message.
    """
    keyword = _extract_keywords(title, content)

    # Build a candidate list: Wikimedia result (if any) + Picsum fallback
    image_url: Optional[str] = None
    try:
        image_url = await _wikimedia_search(keyword)
    except Exception:
        image_url = None

    # Try the primary URL first; on any failure, fall through to Picsum
    candidates: list[str] = []
    if image_url:
        candidates.append(image_url)
    candidates.append(
        f"https://picsum.photos/1280/720?random={int(time.time() * 1000)}"
    )

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for url in candidates:
            try:
                resp = await client.get(url)
                if resp.status_code == 200 and len(resp.content) > 1024:
                    return resp.content
            except Exception:
                continue
    return None


async def ai_generate_cover_image(
    title: str,
    content: str = "",
    size: str = "1792x1024",
) -> Optional[bytes]:
    """
    Generate a cover image using the OpenAI Images API.

    Returns:
        - raw PNG bytes on success
        - None if OPENAI_API_KEY is not configured
    Raises:
        RuntimeError with a clear message on any other failure (network,
        invalid key, rate limit, content policy, etc.) — the caller will
        turn this into an HTTP 502 with that message in `detail`.
    """
    import logging
    logger = logging.getLogger(__name__)

    api_key = settings.OPENAI_API_KEY
    if not api_key or api_key.startswith("sk-your") or api_key.strip() == "":
        return None

    keyword = _extract_keywords(title, content)
    excerpt = (content or "")[:400].replace("\n", " ").strip()

    prompt = (
        f"A modern, clean, editorial-style cover illustration for an article titled "
        f'"{title}". Theme: {keyword}. '
        f"Style: minimalist flat illustration or soft 3D render, "
        f"with a focal subject relevant to the article. "
        f"Use a balanced color palette suitable for a tech blog header. "
        f"Article excerpt for context: {excerpt}"
    )

    last_error: str = ""

    # Try DALL-E 3 first
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key, timeout=120)
        response = await client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size=size,
            quality="standard",
            n=1,
        )
        image_url = response.data[0].url
        async with httpx.AsyncClient(timeout=60) as http:
            r = await http.get(image_url)
            if r.status_code == 200 and len(r.content) > 1024:
                return r.content
            last_error = f"DALL-E 3 返回的图片下载失败 (HTTP {r.status_code})"
    except Exception as exc:
        last_error = f"DALL-E 3 调用失败: {type(exc).__name__}: {str(exc)[:200]}"
        logger.warning("dall-e-3 failed: %s", last_error)

    # Fallback to gpt-image-1 (returns base64)
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key, timeout=120)
        response = await client.images.generate(
            model="gpt-image-1",
            prompt=prompt,
            size=size,
            n=1,
        )
        b64 = getattr(response.data[0], "b64_json", None)
        if b64:
            return base64.b64decode(b64)
        image_url = getattr(response.data[0], "url", None)
        if image_url:
            async with httpx.AsyncClient(timeout=60) as http:
                r = await http.get(image_url)
                if r.status_code == 200 and len(r.content) > 1024:
                    return r.content
        last_error += " | gpt-image-1 返回无有效图片"
    except Exception as exc:
        last_error += f" | gpt-image-1 也失败: {type(exc).__name__}: {str(exc)[:200]}"
        logger.warning("gpt-image-1 failed: %s", last_error)

    raise RuntimeError(last_error or "AI 图像生成返回为空")
