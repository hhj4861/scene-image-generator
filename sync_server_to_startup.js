const fs = require('fs');
const path = require('path');

const serverJsPath = path.join(__dirname, 'terraform', 'server.js');
const startupShPath = path.join(__dirname, 'terraform', 'startup.sh');

const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');
const startupShContent = fs.readFileSync(startupShPath, 'utf8');

// Find the start and end markers in startup.sh
const startMarker = "cat > server.js << 'SERVEREOF'";
const endMarker = "SERVEREOF";

const startIndex = startupShContent.indexOf(startMarker);
const endIndex = startupShContent.lastIndexOf(endMarker); // careful, SERVEREOF appears in start too

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find markers in startup.sh");
    process.exit(1);
}

// Check real end index (it should be after start index)
// The end marker is on its own line
const meaningfulEndIndex = startupShContent.indexOf('\nSERVEREOF', startIndex);

if (meaningfulEndIndex === -1) {
    console.error("Could not find end marker properly");
    process.exit(1);
}

const newStartupShContent = startupShContent.substring(0, startIndex + startMarker.length + 1) +
    serverJsContent + "\n" +
    startupShContent.substring(meaningfulEndIndex);

fs.writeFileSync(startupShPath, newStartupShContent);
console.log("Successfully updated startup.sh with content from server.js");
