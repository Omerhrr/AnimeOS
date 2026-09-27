#!/bin/bash
# Reinstall Blender 5.2.2 for the BLENDER_LOCAL driver (workspace resets wipe /usr/local)
set -e
cd /tmp
if [ -f blender-5.2.2-linux-x64.tar.xz ]; then echo "tarball present"; else
  echo "downloading blender 5.2.2..."
  curl -sSL -o blender-5.2.2-linux-x64.tar.xz "https://download.blender.org/release/Blender5.2/blender-5.2.2-linux-x64.tar.xz"
fi
tar -xf blender-5.2.2-linux-x64.tar.xz -C /opt/
ln -sf /opt/blender-5.2.2-linux-x64/blender /usr/local/bin/blender
blender --version | head -1
