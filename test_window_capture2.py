import Quartz
from AppKit import NSWorkspace
import Quartz.CoreGraphics as CG
import numpy as np
import cv2

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

cg_image = CG.CGWindowListCreateImage(
    CG.CGRectNull,
    CG.kCGWindowListOptionIncludingWindow,
    target_window_id,
    CG.kCGWindowImageBoundsIgnoreFraming
)

if cg_image:
    width = CG.CGImageGetWidth(cg_image)
    height = CG.CGImageGetHeight(cg_image)
    bytes_per_row = CG.CGImageGetBytesPerRow(cg_image)
    data_provider = CG.CGImageGetDataProvider(cg_image)
    data = CG.CGDataProviderCopyData(data_provider)
    
    # Convert to numpy array
    img_data = np.frombuffer(data, dtype=np.uint8)
    
    # Ensure bytes_per_row matches the expected width * 4. 
    # Sometimes CGImage aligns to 32 bytes or 64 bytes.
    # We must reshape taking bytes_per_row into account, and then crop width.
    img_array = img_data.reshape((height, bytes_per_row // 4, 4))
    img_array = img_array[:, :width, :]
    
    cv2.imwrite("test_cgimage.png", img_array)
    print(f"Saved test_cgimage.png of shape {img_array.shape}")
else:
    print("Failed to capture CGImage")
