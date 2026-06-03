import sys
sys.path.append("/Users/Mercury/Library/Application Support/whimbox_app/python-embedded/lib/python3.12/site-packages")

from whimbox.common.logger import logger
from whimbox.platform.macos.window import MacOSWindowManager
import Quartz
from AppKit import NSWorkspace

def get_infinity_nikki_pid():
    workspace = NSWorkspace.sharedWorkspace()
    for app in workspace.runningApplications():
        if "Nikki" in (app.localizedName() or "") or "infinity" in (app.bundleIdentifier() or "").lower():
            print(f"Found game: {app.localizedName()} PID: {app.processIdentifier()}")
            return app.processIdentifier(), app
    print("Game not found!")
    return None, None

pid, app = get_infinity_nikki_pid()
if pid:
    from whimbox.platform.macos.capture import MacOSCaptureManager
    mgr = MacOSCaptureManager()
    img = mgr.capture_window(app, pid)
    print("Image shape:", img.shape if img is not None else "None")
    if img is not None:
        import cv2
        cv2.imwrite("test_mac_screenshot.png", img)
        print("Saved to test_mac_screenshot.png")
