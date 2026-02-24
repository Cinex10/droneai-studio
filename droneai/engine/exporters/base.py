"""Abstract base class for show export."""
from abc import ABC, abstractmethod

from droneai.show_format.schema import Show


class ShowExporter(ABC):
    """Exports a show to a file."""

    @abstractmethod
    def export(self, show: Show, path: str) -> None:
        """Export the show to the given file path.

        Args:
            show: The Show object to export.
            path: Output file path.
        """
        ...
