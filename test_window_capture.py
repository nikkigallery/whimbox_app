import Quartz
from AppKit import NSWorkspace
import Quartz.CoreGraphics as CG

def get_infinity_nikki_pid():
    workspace = NSWorkspace.sharedWorkspace()
    for app in workspace.runningApplications():
        if "Nikki" in (app.localizedName() or "") or "infinity" in (app.bundleIdentifier() or "").lower():
            return app.processIdentifier()
    return None

pid = get_infinity_nikki_pid()
if not pid:
    print("Game not found")
    exit(1)

window_list = Quartz.CGWindowListCopyWindowInfo(
    Quartz.kCGWindowListOptionAll,
    Quartz.kCGNullWindowID,
)

target_window_id = None
for window in window_list:
    if window.get(Quartz.kCGWindowOwnerPID) == pid:
        layer = window.get(Quartz.kCGWindowLayer, 0)
        bounds = window.get(Quartz.kCGWindowBounds)
        if layer == 0 and bounds and bounds.get('Height', 0) > 100:
            target_window_id = window.get(Quartz.kCGWindowNumber)
            break

if not target_window_id:
    print("Game window not found")
    exit(1)

print("Capturing window ID:", target_window_id)
# Capture the window
cg_image = CG.CGWindowListCreateImage(
    CG.CGRectNull,
    CG.kCGWindowListOptionIncludingWindow,
    target_window_id,
    CG.kCGWindowImageBoundsIgnoreFraming
)

if cg_image:
    width = CG.CGImageGetWidth(cg_image)
    height = CG.CGImageGetHeight(cg_image)
    print(f"Captured CGImage size: {width}x{height}")
else:
    print("Failed to capture CGImage")
