import Quartz

pid = 1117
window_list = Quartz.CGWindowListCopyWindowInfo(
    Quartz.kCGWindowListOptionAll,
    Quartz.kCGNullWindowID,
)
print("Searching for windows of PID", pid)
found = False
for window in window_list:
    if window.get(Quartz.kCGWindowOwnerPID) == pid:
        found = True
        layer = window.get(Quartz.kCGWindowLayer, 0)
        bounds = window.get(Quartz.kCGWindowBounds)
        name = window.get(Quartz.kCGWindowName, "")
        print(f"Layer: {layer}, Bounds: {bounds}, Name: {name}")
if not found:
    print("No windows found for this PID!")
