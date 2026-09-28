import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SVG_PATH = path.resolve("public/griot-mark.svg");
const ASSETS_DIR = path.resolve("assets");

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  const svgBuffer = fs.readFileSync(SVG_PATH);

  console.log("Generating base 1024x1024 and splash assets with enlarged GRIOT mark...");

  // 1. icon-only.png (1024x1024)
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(path.join(ASSETS_DIR, "icon-only.png"));

  // 2. icon-background.png (1024x1024 solid dark #060608)
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 6, g: 6, b: 8, alpha: 1 },
    },
  })
    .png()
    .toFile(path.join(ASSETS_DIR, "icon-background.png"));

  // 3. icon-foreground.png (1024x1024 with symbol occupying ~72% of canvas, matching ChatGPT/Claude/Grok proportions)
  const foregroundSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1024" height="1024">
    <defs>
      <linearGradient id="griot-monochrome" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFFFFF" />
        <stop offset="60%" stop-color="#E4E4E7" />
        <stop offset="100%" stop-color="#91919E" />
      </linearGradient>
      <radialGradient id="ambient-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.16" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </radialGradient>
    </defs>
    <circle cx="256" cy="256" r="230" fill="url(#ambient-glow)" />
    <g transform="translate(256, 256) scale(1.20) translate(-257, -256)">
      <path d="M 196 186 
               C 130 186, 130 256, 196 256 
               C 262 256, 262 326, 328 326 
               C 394 326, 394 256, 328 256 
               C 262 256, 262 186, 196 186 Z" 
            fill="none" 
            stroke="url(#griot-monochrome)" 
            stroke-width="26" 
            stroke-linecap="round" 
            stroke-linejoin="round" />
      <line x1="328" y1="256" x2="385" y2="256" 
            stroke="url(#griot-monochrome)" 
            stroke-width="26" 
            stroke-linecap="round" />
    </g>
  </svg>`;

  const symbolBuffer = await sharp(Buffer.from(foregroundSvg)).resize(520, 520).toBuffer();

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: symbolBuffer, gravity: "center" }])
    .png()
    .toFile(path.join(ASSETS_DIR, "icon-foreground.png"));

  // 4. splash.png (2732x2732 dark background with center logo)
  const splashSymbol = await sharp(svgBuffer).resize(920, 920).toBuffer();

  await sharp({
    create: {
      width: 2732,
      height: 2732,
      channels: 4,
      background: { r: 6, g: 6, b: 8, alpha: 1 },
    },
  })
    .composite([{ input: splashSymbol, gravity: "center" }])
    .png()
    .toFile(path.join(ASSETS_DIR, "splash.png"));

  console.log("Generating Android res mipmaps if directory exists...");

  const resDir = path.resolve("android/app/src/main/res");
  const mipmaps = [
    { dir: "mipmap-mdpi", size: 48, fgSize: 108 },
    { dir: "mipmap-hdpi", size: 72, fgSize: 162 },
    { dir: "mipmap-xhdpi", size: 96, fgSize: 216 },
    { dir: "mipmap-xxhdpi", size: 144, fgSize: 324 },
    { dir: "mipmap-xxxhdpi", size: 192, fgSize: 432 },
  ];

  if (fs.existsSync(resDir)) {
    for (const m of mipmaps) {
      const targetDir = path.join(resDir, m.dir);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // ic_launcher.png & ic_launcher_round.png with black background and enlarged symbol
      await sharp(svgBuffer)
        .resize(m.size, m.size)
        .png()
        .toFile(path.join(targetDir, "ic_launcher.png"));

      await sharp(svgBuffer)
        .resize(m.size, m.size)
        .png()
        .toFile(path.join(targetDir, "ic_launcher_round.png"));

      // ic_launcher_foreground.png (balanced at ~50% of safe zone)
      const fgPadded = await sharp(Buffer.from(foregroundSvg))
        .resize(Math.round(m.fgSize * 0.5), Math.round(m.fgSize * 0.5))
        .toBuffer();

      await sharp({
        create: {
          width: m.fgSize,
          height: m.fgSize,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([{ input: fgPadded, gravity: "center" }])
        .png()
        .toFile(path.join(targetDir, "ic_launcher_foreground.png"));
    }
  }

  console.log("All icons generated successfully with enlarged GRIOT mark!");
}

main().catch((err) => {
  console.error("Failed to generate assets:", err);
  process.exit(1);
});
