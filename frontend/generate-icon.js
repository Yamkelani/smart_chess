// Generate a chess app icon - white king piece on dark gradient background
const sharp = require('sharp');

const size = 1024;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="65%">
      <stop offset="0%" stop-color="#2a2d5e"/>
      <stop offset="100%" stop-color="#0a0c1e"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="40%">
      <stop offset="0%" stop-color="#00d2ff" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#00d2ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="piece" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#c0c0d0"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#00d2ff" flood-opacity="0.4"/>
    </filter>
  </defs>
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="180" fill="url(#bg)"/>
  <!-- Glow -->
  <ellipse cx="512" cy="480" rx="350" ry="320" fill="url(#glow)"/>
  <!-- Board pattern hint -->
  <rect x="200" y="680" width="80" height="80" rx="8" fill="rgba(255,255,255,0.06)"/>
  <rect x="280" y="680" width="80" height="80" rx="8" fill="rgba(255,255,255,0.12)"/>
  <rect x="360" y="680" width="80" height="80" rx="8" fill="rgba(255,255,255,0.06)"/>
  <rect x="440" y="680" width="80" height="80" rx="8" fill="rgba(255,255,255,0.12)"/>
  <rect x="520" y="680" width="80" height="80" rx="8" fill="rgba(255,255,255,0.06)"/>
  <rect x="600" y="680" width="80" height="80" rx="8" fill="rgba(255,255,255,0.12)"/>
  <rect x="680" y="680" width="80" height="80" rx="8" fill="rgba(255,255,255,0.06)"/>
  <rect x="200" y="760" width="80" height="80" rx="8" fill="rgba(255,255,255,0.12)"/>
  <rect x="280" y="760" width="80" height="80" rx="8" fill="rgba(255,255,255,0.06)"/>
  <rect x="360" y="760" width="80" height="80" rx="8" fill="rgba(255,255,255,0.12)"/>
  <rect x="440" y="760" width="80" height="80" rx="8" fill="rgba(255,255,255,0.06)"/>
  <rect x="520" y="760" width="80" height="80" rx="8" fill="rgba(255,255,255,0.12)"/>
  <rect x="600" y="760" width="80" height="80" rx="8" fill="rgba(255,255,255,0.06)"/>
  <rect x="680" y="760" width="80" height="80" rx="8" fill="rgba(255,255,255,0.12)"/>
  <!-- King piece (chess unicode style) -->
  <text x="512" y="560" text-anchor="middle" font-size="480" font-family="serif"
    fill="url(#piece)" filter="url(#shadow)">♔</text>
  <!-- "3D" badge -->
  <rect x="680" y="120" width="180" height="70" rx="35" fill="#00d2ff" opacity="0.9"/>
  <text x="770" y="167" text-anchor="middle" font-size="42" font-weight="bold"
    font-family="system-ui, sans-serif" fill="#0a0c1e">3D</text>
</svg>`;

sharp(Buffer.from(svg))
  .resize(1024, 1024)
  .png()
  .toFile('app-icon.png')
  .then(() => console.log('Icon generated: app-icon.png'))
  .catch(err => console.error('Error:', err));
