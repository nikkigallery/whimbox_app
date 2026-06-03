import sys
sys.path.append("/Users/Mercury/Library/Application Support/whimbox_app/python-embedded/lib/python3.12/site-packages")
import cv2
from whimbox.api.ocr_rapid import RapidOcr
ocr_obj = RapidOcr()
img = cv2.imread("test_mac_screenshot.png")
if img is None:
    print("Failed to read image")
else:
    print("Image loaded, shape:", img.shape)
    res = ocr_obj.get_all_texts(img)
    print("OCR results length:", len(res) if res else 0)
    if res:
        for item in res:
            print(" -", item.text)
