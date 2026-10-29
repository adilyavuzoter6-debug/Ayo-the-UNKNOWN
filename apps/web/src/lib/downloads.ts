// Installers are attached to GitHub releases by .github/workflows/desktop-release.yml. Their file
// names carry no version, so /releases/latest/download/<name> always serves the newest build.
const RELEASES = "https://github.com/adilyavuzoter6-debug/Ayo-the-UNKNOWN/releases/latest/download";

export const DOWNLOADS = {
  macArm: `${RELEASES}/Piscatio-mac-arm64.dmg`,
  macIntel: `${RELEASES}/Piscatio-mac-x64.dmg`,
  windows: `${RELEASES}/Piscatio-win-x64.exe`,
} as const;
