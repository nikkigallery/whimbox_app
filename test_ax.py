import ApplicationServices
import CoreFoundation

options = {ApplicationServices.kAXTrustedCheckOptionPrompt: True}
trusted = ApplicationServices.AXIsProcessTrustedWithOptions(options)
print("Trusted:", trusted)
