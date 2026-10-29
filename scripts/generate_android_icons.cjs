const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const densities = [
  { folder: 'mipmap-mdpi', iconSize: 48, fgSize: 108 },
  { folder: 'mipmap-hdpi', iconSize: 72, fgSize: 162 },
  { folder: 'mipmap-xhdpi', iconSize: 96, fgSize: 216 },
  { folder: 'mipmap-xxhdpi', iconSize: 144, fgSize: 324 },
  { folder: 'mipmap-xxxhdpi', iconSize: 192, fgSize: 432 },
];

const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

function getIconSvg(size, isRound = false) {
  const rx = isRound ? size / 2 : Math.round(size * 0.22);
  const center = size / 2;
  const radius = Math.round(size * 0.40);
  const strokeWidth = Math.max(2, Math.round(size * 0.035));
  const fontSize = Math.round(size * 0.46);
  const textY = Math.round(size * 0.65);

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="shapeClip">
          <rect width="${size}" height="${size}" rx="${rx}" fill="#0f2318"/>
        </clipPath>
        <radialGradient id="neonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#143e23" />
          <stop offset="100%" stop-color="#0a1a0e" />
        </radialGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${rx}" fill="#0f2318"/>
      <g clip-path="url(#shapeClip)">
        <circle cx="${center}" cy="${center}" r="${radius}" fill="url(#neonGlow)" stroke="#39ff14" stroke-width="${strokeWidth}"/>
        <text x="${center}" y="${textY}" text-anchor="middle" font-family="'IBM Plex Sans', 'Segoe UI', Georgia, serif" 
              font-size="${fontSize}" font-weight="700" fill="#39ff14">৳</text>
      </g>
    </svg>
  `;
}

function getForegroundSvg(size) {
  const center = size / 2;
  // Adaptive icon safe zone is center 66% (72dp of 108dp)
  const radius = Math.round(size * 0.28);
  const strokeWidth = Math.max(3, Math.round(size * 0.025));
  const fontSize = Math.round(size * 0.32);
  const textY = Math.round(size * 0.61);

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="neonGlowFg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#143e23" />
          <stop offset="100%" stop-color="#0a1a0e" />
        </radialGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#39ff14" flood-opacity="0.3"/>
        </filter>
      </defs>
      <circle cx="${center}" cy="${center}" r="${radius}" fill="url(#neonGlowFg)" stroke="#39ff14" stroke-width="${strokeWidth}" filter="url(#glow)"/>
      <text x="${center}" y="${textY}" text-anchor="middle" font-family="'IBM Plex Sans', 'Segoe UI', Georgia, serif" 
            font-size="${fontSize}" font-weight="700" fill="#39ff14">৳</text>
    </svg>
  `;
}

async function generate() {
  console.log('Launching browser to render icons...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage();

  for (const d of densities) {
    const targetFolder = path.join(resDir, d.folder);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    // 1. ic_launcher.png (Rounded squircle)
    const iconSvg = getIconSvg(d.iconSize, false);
    await page.setViewportSize({ width: d.iconSize, height: d.iconSize });
    await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden;background:transparent;">${iconSvg}</body></html>`);
    const iconPath = path.join(targetFolder, 'ic_launcher.png');
    await page.screenshot({ path: iconPath, omitBackground: true });

    // 2. ic_launcher_round.png (Circular)
    const roundSvg = getIconSvg(d.iconSize, true);
    await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden;background:transparent;">${roundSvg}</body></html>`);
    const roundPath = path.join(targetFolder, 'ic_launcher_round.png');
    await page.screenshot({ path: roundPath, omitBackground: true });

    // 3. ic_launcher_foreground.png (Adaptive icon layer)
    const fgSvg = getForegroundSvg(d.fgSize);
    await page.setViewportSize({ width: d.fgSize, height: d.fgSize });
    await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden;background:transparent;">${fgSvg}</body></html>`);
    const fgPath = path.join(targetFolder, 'ic_launcher_foreground.png');
    await page.screenshot({ path: fgPath, omitBackground: true });

    console.log(`Generated icons for ${d.folder}: ${d.iconSize}px, ${d.fgSize}px`);
  }

  await browser.close();
  console.log('All Android launcher icons generated successfully!');
}

generate().catch(console.error);
