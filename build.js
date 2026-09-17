const fs = require('fs-extra');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const srcDir = path.join(__dirname, 'public');
const distDir = path.join(__dirname, 'dist');

async function build() {
  console.log("Starting build process...");
  
  // 1. Clean dist directory if it exists inside public
  if (fs.existsSync(distDir)) {
    fs.removeSync(distDir);
  }
  
  // 2. Copy everything from public to public/dist (ignoring dist itself)
  console.log("Copying files to dist...");
  fs.copySync(srcDir, distDir, {
    filter: (src) => {
      // Don't copy the dist folder into itself
      return src !== distDir;
    }
  });

  // 3. Find and obfuscate all JS files
  const jsDir = path.join(distDir, 'js');
  if (fs.existsSync(jsDir)) {
    obfuscateDirectory(jsDir);
  }
  
  console.log("Build complete! Files are now securely obfuscated in dist.");
}

function obfuscateDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      obfuscateDirectory(fullPath);
    } else if (fullPath.endsWith('.js')) {
      console.log(`Obfuscating: ${file}`);
      const code = fs.readFileSync(fullPath, 'utf8');
      
      // NOTE: the heavy transforms (controlFlowFlattening, deadCodeInjection,
      // stringArrayCallsTransform, splitStrings) were removed because they made
      // the obfuscator allocate hundreds of MB and pushed the deploy instance
      // past its 512MB limit ("Instance failed ... Ran out of memory"). This
      // lighter preset still obfuscates identifiers + string literals (so the
      // source is not trivially readable) while staying well within memory.
      const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        debugProtection: true,
        debugProtectionInterval: 0,
        disableConsoleOutput: true,
        identifierNamesGenerator: 'hexadecimal',
        log: false,
        numbersToExpressions: false,
        renameGlobals: false,
        selfDefending: true,
        simplify: true,
        splitStrings: false,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        stringArrayThreshold: 0.5,
        unicodeEscapeSequence: false
      });
      
      fs.writeFileSync(fullPath, obfuscationResult.getObfuscatedCode());
    }
  }
}

build().catch(err => {
  console.error("Build failed:", err);
  process.exit(1);
});
