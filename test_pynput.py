import sys
sys.path.append("/Users/Mercury/Library/Application Support/whimbox_app/python-embedded/lib/python3.12/site-packages")
from pynput import keyboard
def on_press(key):
    print("Pressed", key)
    return False

print("Starting listener...")
with keyboard.Listener(on_press=on_press) as listener:
    listener.join()
print("Listener ended.")
