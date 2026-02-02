// scripts/generate-icons.js
// Run with: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

// Create a simple canvas-based icon generator using HTML canvas
const generateIconHtml = (size) => `
<!DOCTYPE html>
<html>
<head>
    <style>canvas { display: none; }</style>
</head>
<body>
    <canvas id="canvas" width="${size}" height="${size}"></canvas>
    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const size = ${size};
        const radius = size * 0.22; // Corner radius
        
        // Draw rounded rectangle background
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath();
        ctx.roundRect(0, 0, size, size, radius);
        ctx.fill();
        
        // Draw comma/apostrophe symbol
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold ' + (size * 0.7) + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('写', size/2, size/2 + size*0.05);
        
        // Export as PNG data URL
        console.log(canvas.toDataURL('image/png'));
    </script>
</body>
</html>
`;

console.log('Icon generation script - use the SVG icons instead');
console.log('The PNG files in public/icons should work correctly.');
console.log('If Chrome still shows default icon, try reloading the extension.');
