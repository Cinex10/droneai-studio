"""Formation shape generators.

Each function takes a drone count and shape parameters,
returns a list of (x, y, z) tuples representing drone positions in meters.
Coordinate system: X=right, Y=forward, Z=up.
"""
import math
from typing import List, Tuple

Position = Tuple[float, float, float]


def grid_formation(
    count: int,
    spacing: float = 2.0,
    altitude: float = 10.0,
) -> List[Position]:
    """Arrange drones in a flat square grid centered at origin."""
    cols = math.ceil(math.sqrt(count))
    rows = math.ceil(count / cols)
    points = []
    for i in range(count):
        row = i // cols
        col = i % cols
        x = (col - (cols - 1) / 2) * spacing
        y = (row - (rows - 1) / 2) * spacing
        points.append((x, y, altitude))
    return points


def circle_formation(
    count: int,
    radius: float = 10.0,
    altitude: float = 10.0,
) -> List[Position]:
    """Arrange drones in a circle in the XY plane."""
    points = []
    for i in range(count):
        angle = 2 * math.pi * i / count
        x = radius * math.cos(angle)
        y = radius * math.sin(angle)
        points.append((x, y, altitude))
    return points


def heart_formation(
    count: int,
    scale: float = 10.0,
    altitude: float = 10.0,
) -> List[Position]:
    """Arrange drones along a heart shape in the XZ plane (visible from front).

    Uses parametric heart curve: x = 16sin^3(t), y = 13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)
    Scaled and centered.
    """
    points = []
    for i in range(count):
        t = 2 * math.pi * i / count
        # Parametric heart curve
        raw_x = 16 * (math.sin(t) ** 3)
        raw_y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        # Normalize to [-1, 1] range (heart curve goes roughly -17 to 17 in x, -17 to 15 in y)
        x = raw_x / 17.0 * (scale / 2)
        z = raw_y / 17.0 * (scale / 2) + altitude
        points.append((x, 0.0, z))
    return points


def star_formation(
    count: int,
    outer_radius: float = 10.0,
    inner_radius: float = 5.0,
    points_count: int = 5,
    altitude: float = 10.0,
) -> List[Position]:
    """Arrange drones along a star shape in the XY plane."""
    # Generate star vertices (alternating outer/inner)
    star_vertices = []
    for i in range(points_count * 2):
        angle = math.pi * i / points_count - math.pi / 2  # start from top
        r = outer_radius if i % 2 == 0 else inner_radius
        star_vertices.append((r * math.cos(angle), r * math.sin(angle)))

    # Distribute drones evenly along star perimeter
    # Calculate perimeter segments
    segments = []
    total_length = 0.0
    for i in range(len(star_vertices)):
        x1, y1 = star_vertices[i]
        x2, y2 = star_vertices[(i + 1) % len(star_vertices)]
        seg_len = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        segments.append((x1, y1, x2, y2, seg_len))
        total_length += seg_len

    points = []
    for i in range(count):
        target_dist = total_length * i / count
        cumulative = 0.0
        for x1, y1, x2, y2, seg_len in segments:
            if cumulative + seg_len >= target_dist or seg_len == 0:
                t = (target_dist - cumulative) / seg_len if seg_len > 0 else 0
                x = x1 + t * (x2 - x1)
                y = y1 + t * (y2 - y1)
                points.append((x, y, altitude))
                break
            cumulative += seg_len

    return points


def spiral_formation(
    count: int,
    radius: float = 10.0,
    turns: float = 3.0,
    altitude_start: float = 5.0,
    altitude_end: float = 20.0,
) -> List[Position]:
    """Arrange drones in a 3D spiral (helix)."""
    points = []
    for i in range(count):
        t = i / max(count - 1, 1)
        angle = 2 * math.pi * turns * t
        r = radius * (1 - 0.3 * t)  # slightly narrowing spiral
        x = r * math.cos(angle)
        y = r * math.sin(angle)
        z = altitude_start + (altitude_end - altitude_start) * t
        points.append((x, y, z))
    return points


def sphere_formation(
    count: int,
    radius: float = 10.0,
) -> List[Position]:
    """Distribute drones on a sphere using Fibonacci sphere algorithm."""
    points = []
    golden_ratio = (1 + math.sqrt(5)) / 2
    for i in range(count):
        theta = math.acos(1 - 2 * (i + 0.5) / count)
        phi = 2 * math.pi * i / golden_ratio
        x = radius * math.sin(theta) * math.cos(phi)
        y = radius * math.sin(theta) * math.sin(phi)
        z = radius * math.cos(theta) + radius  # shift up so bottom is at z=0
        points.append((x, y, z))
    return points


def text_formation(
    text: str,
    count: int = 50,
    scale: float = 10.0,
    altitude: float = 10.0,
) -> List[Position]:
    """Arrange drones to spell text using a simple pixel font.

    Uses a basic 5x7 pixel font. Drones are distributed across lit pixels.
    Text is rendered in the XZ plane (visible from front).
    """
    # Simple 5x7 pixel font for A-Z and 0-9
    FONT = {
        'A': ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
        'B': ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
        'C': ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
        'D': ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
        'E': ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
        'F': ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
        'G': ["01110", "10001", "10000", "10011", "10001", "10001", "01110"],
        'H': ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
        'I': ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
        'J': ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
        'K': ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
        'L': ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
        'M': ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
        'N': ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
        'O': ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
        'P': ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
        'Q': ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
        'R': ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
        'S': ["01110", "10001", "10000", "01110", "00001", "10001", "01110"],
        'T': ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
        'U': ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
        'V': ["10001", "10001", "10001", "10001", "01010", "01010", "00100"],
        'W': ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
        'X': ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
        'Y': ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
        'Z': ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
        '0': ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
        '1': ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
        '2': ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
        '3': ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
        '4': ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
        '5': ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
        '6': ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
        '7': ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
        '8': ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
        '9': ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
        ' ': ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    }

    # Collect all lit pixel positions
    pixels = []
    cursor_x = 0
    for char in text.upper():
        glyph = FONT.get(char, FONT.get(' '))
        for row_idx, row in enumerate(glyph):
            for col_idx, pixel in enumerate(row):
                if pixel == '1':
                    pixels.append((cursor_x + col_idx, 6 - row_idx))  # flip Y so text isn't upside down
        cursor_x += 6  # 5 wide + 1 space

    if not pixels:
        return []

    # Scale and center
    min_x = min(p[0] for p in pixels)
    max_x = max(p[0] for p in pixels)
    min_y = min(p[1] for p in pixels)
    max_y = max(p[1] for p in pixels)
    width = max_x - min_x if max_x > min_x else 1
    height = max_y - min_y if max_y > min_y else 1
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2

    # Scale to fit within requested scale
    pixel_scale = scale / max(width, height)

    # If more pixels than drones, subsample evenly
    if len(pixels) > count:
        step = len(pixels) / count
        pixels = [pixels[int(i * step)] for i in range(count)]

    points = []
    for px, py in pixels:
        x = (px - center_x) * pixel_scale
        z = (py - center_y) * pixel_scale + altitude
        points.append((x, 0.0, z))

    return points
