import sys
sys.path.append("/Users/Mercury/Library/Application Support/whimbox_app/python-embedded/lib/python3.12/site-packages")
import cv2
from whimbox.api.ocr_rapid import RapidOcr
ocr_obj = RapidOcr()
img = cv2.imread("test_cgimage.png")
if img is None:
    print("Failed to read image")
else:
    res = ocr_obj.get_all_texts(img)
    if res:
        print("Texts:", res[:20])
