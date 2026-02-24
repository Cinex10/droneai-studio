"""Animate smooth transitions between formations.

Sets interpolation mode on drone F-curves between keyframed formations.
"""
import bpy


def animate_transition(frame_start, frame_end, easing="EASE_IN_OUT"):
    """Ensure smooth transitions between keyframed positions.

    Drones should already have keyframes at frame_start and frame_end
    (set by create_formation).

    Args:
        frame_start: Frame where the transition begins.
        frame_end: Frame where the transition ends.
        easing: Interpolation type - 'LINEAR', 'EASE_IN_OUT', 'EASE_IN', 'EASE_OUT'.
    """
    drone_collection = bpy.data.collections.get("Drones")
    if not drone_collection:
        print("ERROR: No 'Drones' collection found.")
        return

    interp_map = {
        "LINEAR": "LINEAR",
        "EASE_IN_OUT": "BEZIER",
        "EASE_IN": "BEZIER",
        "EASE_OUT": "BEZIER",
    }
    interp_type = interp_map.get(easing, "BEZIER")

    count = 0
    for drone in drone_collection.objects:
        if not drone.name.startswith("Drone_"):
            continue
        if not drone.animation_data or not drone.animation_data.action:
            continue

        action = drone.animation_data.action
        for fcurve in action.fcurves:
            if fcurve.data_path != "location":
                continue
            for kp in fcurve.keyframe_points:
                if frame_start <= kp.co[0] <= frame_end:
                    kp.interpolation = interp_type
                    if easing == "EASE_IN_OUT":
                        kp.easing = "AUTO"
                    elif easing == "EASE_IN":
                        kp.easing = "EASE_IN"
                    elif easing == "EASE_OUT":
                        kp.easing = "EASE_OUT"
        count += 1

    print(f"Transition set: frames {frame_start}-{frame_end}, {easing} for {count} drones")
