#!/bin/bash
# Reinstall Blender 4.3.2 for the BLENDER_LOCAL driver (workspace resets wipe /usr/local)
set -e
cd /tmp
if [ -f blender-4.3.2-linux-x64.tar.xz ]; then echo "tarball present"; else
  echo "downloading blender 4.3.2..."
  curl -sSL -o blender-4.3.2-linux-x64.tar.xz "https://download.blender.org/release/Blender4.3/blender-4.3.2-linux-x64.tar.xz"
fi
tar -xf blender-4.3.2-linux-x64.tar.xz -C /opt/
ln -sf /opt/blender-4.3.2-linux-x64/blender /usr/local/bin/blender
blender --version | head -1
