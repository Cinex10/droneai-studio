#!/usr/bin/env bash
# Install Python dependencies for the DroneAI MCP server.
# Not strictly required when using `uv run` (deps are auto-resolved via PEP 723),
# but useful for pre-caching or CI environments without uv.
set -euo pipefail
pip install --user mcp
