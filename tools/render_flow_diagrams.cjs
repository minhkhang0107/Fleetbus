#!/usr/bin/env node

/**
 * BusGo Platform — Mermaid to UML Image Renderer
 * Parses all Mermaid diagrams from screen-spec/flows/ and exports them as SVG and PNG.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FLOWS_DIR = path.resolve(__dirname, '../screen-spec/flows');
const IMAGES_DIR = path.join(FLOWS_DIR, 'images');
const DIAGRAMS_DIR = path.join(FLOWS_DIR, 'diagrams');

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(DIAGRAMS_DIR)) fs.mkdirSync(DIAGRAMS_DIR, { recursive: true });

// Create a clean mermaid config
const configFile = path.join(DIAGRAMS_DIR, 'mermaid-config.json');
fs.writeFileSync(
  configFile,
  JSON.stringify(
    {
      theme: 'default',
      themeVariables: {
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '14px',
        primaryColor: '#e0f2fe',
        primaryTextColor: '#0f172a',
        primaryBorderColor: '#0284c7',
        lineColor: '#475569',
        secondaryColor: '#fef3c7',
        tertiaryColor: '#f1f5f9'
      }
    },
    null,
    2
  )
);

const files = fs.readdirSync(FLOWS_DIR).filter((f) => f.endsWith('.md'));

console.log(`🚀 Found ${files.length} Markdown files in screen-spec/flows`);

let totalRendered = 0;

for (const file of files) {
  const filePath = path.join(FLOWS_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const regex = /```mermaid([\s\S]*?)```/g;

  let match;
  let index = 1;
  const baseName = file.replace(/\.md$/, '');

  while ((match = regex.exec(content)) !== null) {
    const mermaidCode = match[1].trim();
    const diagramKey = files.length > 1 && index === 1 ? baseName : `${baseName}-${index}`;
    const mmdPath = path.join(DIAGRAMS_DIR, `${diagramKey}.mmd`);
    const svgPath = path.join(IMAGES_DIR, `${diagramKey}.svg`);
    const pngPath = path.join(IMAGES_DIR, `${diagramKey}.png`);

    fs.writeFileSync(mmdPath, mermaidCode, 'utf8');
    console.log(`\n📐 Processing diagram [${diagramKey}] from ${file}...`);

    try {
      // Export SVG
      execSync(`npx @mermaid-js/mermaid-cli -i "${mmdPath}" -o "${svgPath}" -c "${configFile}" -b white`, {
        stdio: 'inherit'
      });
      // Export PNG (high resolution scale 2)
      execSync(`npx @mermaid-js/mermaid-cli -i "${mmdPath}" -o "${pngPath}" -c "${configFile}" -b white -s 2`, {
        stdio: 'inherit'
      });
      console.log(`  ✅ Generated: ${diagramKey}.svg & ${diagramKey}.png`);
      totalRendered++;
    } catch (err) {
      console.error(`  ❌ Failed to render ${diagramKey}:`, err.message);
    }

    index++;
  }
}

console.log(`\n🎉 Completed rendering ${totalRendered} diagrams into ${IMAGES_DIR}`);
