"""Base publisher interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class PublishResult:
    success: bool
    platform: str
    platform_article_id: Optional[str] = None
    platform_url: Optional[str] = None
    error_message: Optional[str] = None


class BasePublisher(ABC):
    """Base class for all platform publishers."""

    platform_name: str = ""

    @abstractmethod
    async def publish(self, title: str, content: str, **kwargs) -> PublishResult:
        """Publish an article to the platform."""
        ...

    @abstractmethod
    def is_configured(self) -> bool:
        """Check if the publisher has valid credentials."""
        ...
