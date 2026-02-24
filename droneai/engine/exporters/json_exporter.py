"""JSON show exporter -- wraps Phase 0 show format."""
from droneai.engine.exporters.base import ShowExporter
from droneai.show_format.schema import Show


class JsonExporter(ShowExporter):
    """Exports show to JSON format using Phase 0 schema."""

    def export(self, show: Show, path: str) -> None:
        show.save(path)
