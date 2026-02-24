#!/usr/bin/env bash
# Download, strip, and stage Blender for bundling inside DroneAI Studio.
# Usage: ./scripts/prepare-blender.sh arm64   (Apple Silicon)
#        ./scripts/prepare-blender.sh x64     (Intel)
set -euo pipefail

BLENDER_VERSION="4.5.0"
BLENDER_SHORT="4.5"

# --- Parse arguments ---
ARCH="${1:-}"
if [[ "$ARCH" != "arm64" && "$ARCH" != "x64" ]]; then
    echo "Usage: $0 <arm64|x64>"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$PROJECT_ROOT/src-tauri/blender-runtime"
ADDON_SRC="$PROJECT_ROOT/resources/blender-addon/addons/addon.py"

# --- Determine download URL ---
if [[ "$ARCH" == "arm64" ]]; then
    DMG_NAME="blender-${BLENDER_VERSION}-macos-arm64.dmg"
else
    DMG_NAME="blender-${BLENDER_VERSION}-macos-x64.dmg"
fi
DOWNLOAD_URL="https://download.blender.org/release/Blender${BLENDER_SHORT}/${DMG_NAME}"

TMPDIR_WORK="$(mktemp -d)"
trap 'hdiutil detach "$MOUNT_POINT" 2>/dev/null || true; rm -rf "$TMPDIR_WORK"' EXIT

DMG_PATH="$TMPDIR_WORK/$DMG_NAME"

# --- Download ---
echo "==> Downloading $DMG_NAME..."
if command -v curl &>/dev/null; then
    curl -L --progress-bar -o "$DMG_PATH" "$DOWNLOAD_URL"
else
    wget -q --show-progress -O "$DMG_PATH" "$DOWNLOAD_URL"
fi

# --- Mount DMG ---
echo "==> Mounting DMG..."
MOUNT_POINT="$(hdiutil attach "$DMG_PATH" -nobrowse -readonly | tail -1 | awk '{print $NF}')"
# Sometimes the mount point path includes "Blender" — find the .app
BLENDER_APP="$(find "$MOUNT_POINT" -maxdepth 1 -name "Blender*.app" -print -quit)"
if [[ -z "$BLENDER_APP" ]]; then
    echo "ERROR: Could not find Blender.app in mounted DMG at $MOUNT_POINT"
    exit 1
fi
CONTENTS="$BLENDER_APP/Contents"

# --- Stage files ---
echo "==> Staging Blender runtime to $DEST..."
rm -rf "$DEST"
mkdir -p "$DEST/MacOS" "$DEST/Resources"

# Copy binary (preserves executable bit)
cp -p "$CONTENTS/MacOS/Blender" "$DEST/MacOS/Blender"

# Copy Resources/lib (dylibs — required for rpath)
cp -Rp "$CONTENTS/Resources/lib" "$DEST/Resources/lib"

# Copy Blender version data
cp -Rp "$CONTENTS/Resources/${BLENDER_SHORT}" "$DEST/Resources/${BLENDER_SHORT}"

# --- Strip unnecessary files ---
echo "==> Stripping unnecessary files..."
SAVED=0

strip_dir() {
    local dir="$1"
    if [[ -d "$dir" ]]; then
        local size
        size=$(du -sm "$dir" | cut -f1)
        rm -rf "$dir"
        SAVED=$((SAVED + size))
        echo "   Removed $dir (~${size}MB)"
    fi
}

# Locale data (~66MB)
strip_dir "$DEST/Resources/${BLENDER_SHORT}/datafiles/locale"

# USD/OpenUSD Python bindings (~63MB)
strip_dir "$DEST/Resources/${BLENDER_SHORT}/python/lib/python3.11/site-packages/pxr"

# Cython (~11MB)
strip_dir "$DEST/Resources/${BLENDER_SHORT}/python/lib/python3.11/site-packages/Cython"

# pip (~8MB)
strip_dir "$DEST/Resources/${BLENDER_SHORT}/python/lib/python3.11/site-packages/pip"

# __pycache__ dirs
CACHE_SIZE=$(find "$DEST" -type d -name "__pycache__" -exec du -sm {} + 2>/dev/null | awk '{s+=$1} END {print s+0}')
find "$DEST" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
SAVED=$((SAVED + CACHE_SIZE))
echo "   Removed __pycache__ dirs (~${CACHE_SIZE}MB)"

# --- Copy MCP addon ---
echo "==> Installing MCP addon..."
mkdir -p "$DEST/addon/addons"
if [[ -f "$ADDON_SRC" ]]; then
    cp "$ADDON_SRC" "$DEST/addon/addons/addon.py"
    echo "   Copied addon from $ADDON_SRC"
else
    echo "   WARNING: Addon not found at $ADDON_SRC"
    echo "   Run this after placing the addon in resources/blender-addon/addons/addon.py"
fi

# --- Copy droneai Python library ---
DRONEAI_SRC="$PROJECT_ROOT/resources/droneai"
SITE_PACKAGES="$DEST/Resources/${BLENDER_SHORT}/python/lib/python3.11/site-packages"
echo "==> Installing droneai library..."
if [[ -d "$DRONEAI_SRC" ]]; then
    cp -R "$DRONEAI_SRC" "$SITE_PACKAGES/droneai"
    echo "   Copied droneai to $SITE_PACKAGES/droneai"
else
    echo "   WARNING: droneai not found at $DRONEAI_SRC"
fi

# --- Summary ---
echo ""
echo "=== Blender Runtime Prepared ==="
TOTAL_SIZE=$(du -sm "$DEST" | cut -f1)
echo "  Architecture: $ARCH"
echo "  Blender version: $BLENDER_VERSION"
echo "  Location: $DEST"
echo "  Total size: ${TOTAL_SIZE}MB"
echo "  Stripped: ~${SAVED}MB"

# Verify binary arch
echo ""
echo "  Binary arch check:"
file "$DEST/MacOS/Blender"

echo ""
echo "Done. Run 'cargo tauri build' to bundle."
