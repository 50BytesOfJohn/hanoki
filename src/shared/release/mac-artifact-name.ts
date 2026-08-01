/**
 * macOS release artifact names.
 *
 * https://update.electronjs.org picks the asset to hand Squirrel.Mac purely by
 * filename: it needs `-mac`, `-darwin` or `-osx` plus a `.zip` extension to see
 * a macOS build at all, and it reads the architecture from a `-arm64` /
 * `-universal` marker — anything without one is served to Intel machines as x64.
 * Hanoki only ships arm64, so the marker is what keeps the wrong Macs from
 * being offered a binary they cannot run.
 *
 * Keep `MAC_ASSET_PATTERN` in step with the service's own `assetPlatform()`:
 * https://github.com/electron/update.electronjs.org/blob/main/src/asset-platform.ts
 */

export const MAC_ASSET_PATTERN = /.*-(mac|darwin|osx).*\.zip$/i;
export const MAC_ARM64_PATTERN = /-arm64/;

export function macArtifactName(arch: string, version: string, extension: string): string {
  return `hanoki-macos-${arch}-${version}${extension}`;
}
