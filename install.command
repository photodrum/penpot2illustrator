#!/bin/bash
set -e
cd "$(dirname "$0")"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/ru.splat.penpot2ai"
echo "Installing panel to: $DEST"
for v in 9 10 11 12 13 14; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done
killall cfprefsd 2>/dev/null || true
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -R ru.splat.penpot2ai "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
echo
echo "Done. Restart Illustrator and open: Window > Extensions > Penpot → Illustrator"
read -n 1 -s -r -p "Press any key to close..."
echo
