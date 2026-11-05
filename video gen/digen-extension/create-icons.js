// Simple Node.js script to create basic PNG icons
const fs = require('fs');

// Create a simple SVG and note that it needs to be converted
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" rx="24" fill="#2563eb"/>
  <rect x="24" y="32" width="80" height="64" rx="8" fill="white"/>
  <rect x="32" y="40" width="64" height="48" rx="4" fill="#2563eb"/>
  <circle cx="32" cy="48" r="4" fill="white"/>
  <circle cx="32" cy="72" r="4" fill="white"/>
  <circle cx="96" cy="48" r="4" fill="white"/>
  <circle cx="96" cy="72" r="4" fill="white"/>
  <polygon points="54,56 54,72 70,64" fill="white"/>
</svg>`;

fs.writeFileSync('icon.svg', svg);
console.log('Created icon.svg - You can convert this to PNG files or use an online converter');
console.log('');
console.log('Quick option: Upload icon.svg to https://convertio.co/svg-png/');
console.log('Or use any image editor to save as icon16.png, icon48.png, and icon128.png');
