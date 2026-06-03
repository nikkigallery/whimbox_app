"""Diagnostic: capture game window and save what OCR sees."""
import sys
sys.path.insert(0, "/Users/Mercury/Library/Application Support/whimbox_app/python-embedded/lib/python3.12/site-packages")

import cv2
import numpy as np
from whimbox.common.handle_lib import HANDLE_OBJ
from whimbox.interaction.capture import PrintWindowCapture

print("Refreshing game handle...")
HANDLE_OBJ.refresh_handle()
handle = HANDLE_OBJ.get_handle()
pid = HANDLE_OBJ.pid
print(f"Handle: {handle}, PID: {pid}")

if not handle and not pid:
    print("ERROR: Game window not found!")
    sys.exit(1)

# Test raw capture from MacOSCaptureManager
from whimbox.interaction.capture import get_capture_manager
cap_mgr = get_capture_manager()
raw_img = cap_mgr.capture_window(handle, pid)
if raw_img is not None:
    print(f"Raw capture shape: {raw_img.shape}, dtype: {raw_img.dtype}")
    print(f"Raw pixel [0,0]: {raw_img[0,0]}")
    print(f"Raw pixel [100,100]: {raw_img[100,100]}")
    print(f"Raw min: {raw_img.min()}, max: {raw_img.max()}, mean: {raw_img.mean():.1f}")
    cv2.imwrite("/Users/Mercury/Downloads/diag_raw.png", raw_img[:, :, :3])
    print("Saved raw capture to ~/Downloads/diag_raw.png")
else:
    print("ERROR: Raw capture returned None!")
    sys.exit(1)

# Test through PrintWindowCapture pipeline (with normalization)
pwc = PrintWindowCapture(HANDLE_OBJ)
normalized = pwc.capture(force=True)
if normalized is not None:
    print(f"\nNormalized shape: {normalized.shape}, dtype: {normalized.dtype}")
    print(f"Normalized min: {normalized.min()}, max: {normalized.max()}, mean: {normalized.mean():.1f}")
    cv2.imwrite("/Users/Mercury/Downloads/diag_normalized.png", normalized[:, :, :3])
    print("Saved normalized to ~/Downloads/diag_normalized.png")
else:
    print("ERROR: Normalized capture returned None!")

# Test OCR on the login area
from whimbox.ui.ui_assets import AreaLoginOCR
from whimbox.interaction.interaction_core import crop, add_padding
from whimbox.api.ocr_rapid import ocr

cap = normalized
if cap is not None and AreaLoginOCR.position is not None:
    print(f"\nAreaLoginOCR position: {AreaLoginOCR.position}")
    login_crop = crop(cap, AreaLoginOCR.position)
    print(f"Login crop shape: {login_crop.shape}")
    login_crop_3ch = login_crop[:, :, :3]
    login_padded = add_padding(login_crop_3ch, 50)
    cv2.imwrite("/Users/Mercury/Downloads/diag_login_area.png", login_padded)
    print("Saved login area to ~/Downloads/diag_login_area.png")
    
    res = ocr.detect_and_ocr(login_padded, show_res=False)
    print(f"OCR result: {res}")
else:
    print("Cannot test login area OCR - capture or position is None")
    if cap is not None:
        print(f"AreaLoginOCR position: {AreaLoginOCR.position}")
