"""Move drones into a formation shape at a specific frame.

Execute in Blender via MCP execute_blender_code.
Sets keyframes for drone positions to form a shape.
"""
import bpy
import math


def create_formation(shape, frame, count=None, **kwargs):
    """Keyframe drones into a formation at a given frame.

    Args:
        shape: Formation shape name ('grid', 'circle', 'heart', 'star', 'spiral', 'sphere', 'text').
        frame: Blender frame number to set the formation at.
        count: Number of drones (auto-detected from scene if None).
        **kwargs: Shape-specific parameters (scale, radius, altitude, text, etc.).
    """
    # Get drones from scene
    drone_collection = bpy.data.collections.get("Drones")
    if not drone_collection:
        print("ERROR: No 'Drones' collection found. Run create_drones first.")
        return

    drones = sorted(
        [obj for obj in drone_collection.objects if obj.name.startswith("Drone_")],
        key=lambda o: o.name,
    )

    if count is None:
        count = len(drones)
    count = min(count, len(drones))

    # Generate formation positions
    positions = _generate_formation(shape, count, **kwargs)

    # Set keyframes
    bpy.context.scene.frame_set(frame)
    for i, drone in enumerate(drones[:count]):
        if i < len(positions):
            drone.location = positions[i]
            drone.keyframe_insert(data_path="location", frame=frame)

    print(f"Formation '{shape}' set at frame {frame} for {count} drones")


def _generate_formation(shape, count, **kwargs):
    """Generate formation positions. Same math as formations/shapes.py but inline for Blender."""
    altitude = kwargs.get("altitude", 10.0)
    scale = kwargs.get("scale", 10.0)
    radius = kwargs.get("radius", scale / 2)

    if shape == "grid":
        spacing = kwargs.get("spacing", 2.0)
        cols = math.ceil(math.sqrt(count))
        return [
            ((i % cols - (cols - 1) / 2) * spacing,
             (i // cols - (math.ceil(count / cols) - 1) / 2) * spacing,
             altitude)
            for i in range(count)
        ]

    elif shape == "circle":
        return [
            (radius * math.cos(2 * math.pi * i / count),
             radius * math.sin(2 * math.pi * i / count),
             altitude)
            for i in range(count)
        ]

    elif shape == "heart":
        points = []
        for i in range(count):
            t = 2 * math.pi * i / count
            raw_x = 16 * (math.sin(t) ** 3)
            raw_y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
            x = raw_x / 17.0 * (scale / 2)
            z = raw_y / 17.0 * (scale / 2) + altitude
            points.append((x, 0.0, z))
        return points

    elif shape == "star":
        outer_r = radius
        inner_r = kwargs.get("inner_radius", radius * 0.5)
        n_points = kwargs.get("points_count", 5)
        verts = []
        for i in range(n_points * 2):
            angle = math.pi * i / n_points - math.pi / 2
            r = outer_r if i % 2 == 0 else inner_r
            verts.append((r * math.cos(angle), r * math.sin(angle)))
        # Distribute along perimeter
        segments = []
        total = 0.0
        for i in range(len(verts)):
            x1, y1 = verts[i]
            x2, y2 = verts[(i + 1) % len(verts)]
            d = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            segments.append((x1, y1, x2, y2, d))
            total += d
        points = []
        for i in range(count):
            target = total * i / count
            cum = 0.0
            for x1, y1, x2, y2, d in segments:
                if cum + d >= target:
                    t = (target - cum) / d if d > 0 else 0
                    points.append((x1 + t * (x2 - x1), y1 + t * (y2 - y1), altitude))
                    break
                cum += d
        return points

    elif shape == "spiral":
        turns = kwargs.get("turns", 3.0)
        alt_start = kwargs.get("altitude_start", 5.0)
        alt_end = kwargs.get("altitude_end", 20.0)
        return [
            (radius * (1 - 0.3 * i / max(count - 1, 1)) * math.cos(2 * math.pi * turns * i / max(count - 1, 1)),
             radius * (1 - 0.3 * i / max(count - 1, 1)) * math.sin(2 * math.pi * turns * i / max(count - 1, 1)),
             alt_start + (alt_end - alt_start) * i / max(count - 1, 1))
            for i in range(count)
        ]

    elif shape == "sphere":
        golden = (1 + math.sqrt(5)) / 2
        points = []
        for i in range(count):
            theta = math.acos(1 - 2 * (i + 0.5) / count)
            phi = 2 * math.pi * i / golden
            x = radius * math.sin(theta) * math.cos(phi)
            y = radius * math.sin(theta) * math.sin(phi)
            z = radius * math.cos(theta) + radius
            points.append((x, y, z))
        return points

    elif shape == "text":
        text = kwargs.get("text", "HI")
        return _text_positions(text, count, scale, altitude)

    else:
        print(f"Unknown shape: {shape}. Using grid.")
        return _generate_formation("grid", count, **kwargs)


def _text_positions(text, count, scale, altitude):
    """Generate positions for text formation."""
    FONT = {
        'A': ["01110","10001","10001","11111","10001","10001","10001"],
        'B': ["11110","10001","10001","11110","10001","10001","11110"],
        'C': ["01110","10001","10000","10000","10000","10001","01110"],
        'D': ["11100","10010","10001","10001","10001","10010","11100"],
        'E': ["11111","10000","10000","11110","10000","10000","11111"],
        'F': ["11111","10000","10000","11110","10000","10000","10000"],
        'G': ["01110","10001","10000","10011","10001","10001","01110"],
        'H': ["10001","10001","10001","11111","10001","10001","10001"],
        'I': ["01110","00100","00100","00100","00100","00100","01110"],
        'L': ["10000","10000","10000","10000","10000","10000","11111"],
        'M': ["10001","11011","10101","10101","10001","10001","10001"],
        'N': ["10001","11001","10101","10011","10001","10001","10001"],
        'O': ["01110","10001","10001","10001","10001","10001","01110"],
        'R': ["11110","10001","10001","11110","10100","10010","10001"],
        'S': ["01110","10001","10000","01110","00001","10001","01110"],
        'T': ["11111","00100","00100","00100","00100","00100","00100"],
        'U': ["10001","10001","10001","10001","10001","10001","01110"],
        'W': ["10001","10001","10001","10101","10101","10101","01010"],
        'Y': ["10001","10001","01010","00100","00100","00100","00100"],
        ' ': ["00000","00000","00000","00000","00000","00000","00000"],
    }
    pixels = []
    cx = 0
    for ch in text.upper():
        glyph = FONT.get(ch, FONT[' '])
        for ri, row in enumerate(glyph):
            for ci, px in enumerate(row):
                if px == '1':
                    pixels.append((cx + ci, 6 - ri))
        cx += 6
    if not pixels:
        return [(0, 0, altitude)] * count
    mn_x = min(p[0] for p in pixels)
    mx_x = max(p[0] for p in pixels)
    mn_y = min(p[1] for p in pixels)
    mx_y = max(p[1] for p in pixels)
    w = mx_x - mn_x or 1
    h = mx_y - mn_y or 1
    ctr_x = (mn_x + mx_x) / 2
    ctr_y = (mn_y + mx_y) / 2
    ps = scale / max(w, h)
    if len(pixels) > count:
        step = len(pixels) / count
        pixels = [pixels[int(i * step)] for i in range(count)]
    return [((p[0] - ctr_x) * ps, 0.0, (p[1] - ctr_y) * ps + altitude) for p in pixels]


# Execute — customize shape and parameters
# create_formation("heart", frame=48, altitude=15.0, scale=20.0)
