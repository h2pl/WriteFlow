"""WriteFlow MCP Server - exposes writing and publishing tools via MCP protocol."""

import asyncio
import json
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

from app.config import settings
from app.database import async_session, init_db
from app.models.article import Article, ArticleStatus
from app.services.llm_service import llm_service
from app.services.publish_service import publish_service

server = Server("writeflow")


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="writeflow_generate",
            description="使用 AI 生成一篇文章。可指定主题、风格、语言、长度和模型。",
            inputSchema={
                "type": "object",
                "properties": {
                    "topic": {"type": "string", "description": "文章主题"},
                    "style": {
                        "type": "string",
                        "enum": ["tech_blog", "tutorial", "opinion", "news"],
                        "description": "写作风格",
                        "default": "tech_blog",
                    },
                    "language": {
                        "type": "string",
                        "enum": ["zh", "en"],
                        "description": "语言",
                        "default": "zh",
                    },
                    "length": {
                        "type": "string",
                        "enum": ["short", "medium", "long"],
                        "description": "文章长度",
                        "default": "medium",
                    },
                    "provider": {
                        "type": "string",
                        "description": "LLM 提供商: openai, anthropic, deepseek",
                    },
                    "extra_instructions": {
                        "type": "string",
                        "description": "额外写作指令",
                    },
                },
                "required": ["topic"],
            },
        ),
        Tool(
            name="writeflow_list_articles",
            description="列出已有文章，支持按状态筛选。",
            inputSchema={
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "文章状态筛选: draft, generated, published, failed",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回数量限制",
                        "default": 10,
                    },
                },
            },
        ),
        Tool(
            name="writeflow_publish",
            description="将指定文章发布到一个或多个平台。",
            inputSchema={
                "type": "object",
                "properties": {
                    "article_id": {"type": "integer", "description": "文章 ID"},
                    "platforms": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "发布平台列表: wechat, juejin, csdn, zhihu",
                    },
                },
                "required": ["article_id", "platforms"],
            },
        ),
        Tool(
            name="writeflow_get_article",
            description="获取指定文章的详细内容。",
            inputSchema={
                "type": "object",
                "properties": {
                    "article_id": {"type": "integer", "description": "文章 ID"},
                },
                "required": ["article_id"],
            },
        ),
        Tool(
            name="writeflow_platforms",
            description="查看可用的发布平台和 LLM 提供商配置状态。",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
    try:
        if name == "writeflow_generate":
            return await _handle_generate(arguments)
        elif name == "writeflow_list_articles":
            return await _handle_list_articles(arguments)
        elif name == "writeflow_publish":
            return await _handle_publish(arguments)
        elif name == "writeflow_get_article":
            return await _handle_get_article(arguments)
        elif name == "writeflow_platforms":
            return await _handle_platforms(arguments)
        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]
    except Exception as e:
        return [TextContent(type="text", text=f"Error: {str(e)}")]


async def _handle_generate(args: dict) -> list[TextContent]:
    result = await llm_service.generate_article(
        topic=args["topic"],
        style=args.get("style", "tech_blog"),
        language=args.get("language", "zh"),
        length=args.get("length", "medium"),
        provider=args.get("provider"),
        extra_instructions=args.get("extra_instructions"),
    )

    async with async_session() as db:
        article = Article(
            title=result["title"],
            content=result["content"],
            prompt=result["prompt"],
            llm_provider=result["provider"],
            llm_model=result["model"],
            status=ArticleStatus.GENERATED,
        )
        db.add(article)
        await db.commit()
        await db.refresh(article)
        article_id = article.id

    summary = f"✅ 文章已生成并保存\n\n"
    summary += f"📝 ID: {article_id}\n"
    summary += f"📌 标题: {result['title']}\n"
    summary += f"🤖 模型: {result['provider']}/{result['model']}\n"
    summary += f"⏱ 耗时: {result['generation_time']:.1f}s\n\n"
    summary += f"--- 文章内容预览 ---\n{result['content'][:500]}..."

    return [TextContent(type="text", text=summary)]


async def _handle_list_articles(args: dict) -> list[TextContent]:
    from sqlalchemy import select

    async with async_session() as db:
        query = select(Article).order_by(Article.created_at.desc())
        if args.get("status"):
            query = query.where(Article.status == args["status"])
        query = query.limit(args.get("limit", 10))
        result = await db.execute(query)
        articles = list(result.scalars().all())

    if not articles:
        return [TextContent(type="text", text="📭 没有找到文章")]

    lines = [f"📚 共找到 {len(articles)} 篇文章:\n"]
    for a in articles:
        lines.append(f"  [{a.id}] {a.title} | 状态: {a.status} | {a.created_at.strftime('%Y-%m-%d %H:%M')}")

    return [TextContent(type="text", text="\n".join(lines))]


async def _handle_publish(args: dict) -> list[TextContent]:
    async with async_session() as db:
        article = await db.get(Article, args["article_id"])
        if not article:
            return [TextContent(type="text", text=f"❌ 文章 ID {args['article_id']} 不存在")]

        records = await publish_service.publish_article(db, article, args["platforms"])
        await db.commit()

    lines = [f"📤 发布结果 - 《{article.title}》:\n"]
    for r in records:
        status_icon = "✅" if r.status == "success" else "❌"
        line = f"  {status_icon} {r.platform}: {r.status}"
        if r.platform_url:
            line += f" | {r.platform_url}"
        if r.error_message:
            line += f" | 错误: {r.error_message}"
        lines.append(line)

    return [TextContent(type="text", text="\n".join(lines))]


async def _handle_get_article(args: dict) -> list[TextContent]:
    async with async_session() as db:
        article = await db.get(Article, args["article_id"])
        if not article:
            return [TextContent(type="text", text=f"❌ 文章 ID {args['article_id']} 不存在")]

    text = f"📝 《{article.title}》\n"
    text += f"状态: {article.status} | 创建: {article.created_at.strftime('%Y-%m-%d %H:%M')}\n"
    text += f"模型: {article.llm_provider}/{article.llm_model}\n"
    text += f"---\n{article.content}"

    return [TextContent(type="text", text=text)]


async def _handle_platforms(args: dict) -> list[TextContent]:
    platforms = publish_service.get_available_platforms()
    providers = llm_service.list_providers()

    lines = ["📋 WriteFlow 配置状态:\n"]
    lines.append("🤖 LLM 提供商:")
    for p in providers:
        icon = "✅" if p["is_configured"] else "❌"
        lines.append(f"  {icon} {p['display_name']} ({', '.join(p['models'])})")

    lines.append("\n📤 发布平台:")
    for p in platforms:
        icon = "✅" if p["is_configured"] else "❌"
        lines.append(f"  {icon} {p['name']}")

    return [TextContent(type="text", text="\n".join(lines))]


async def main():
    await init_db()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
