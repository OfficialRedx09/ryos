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
      
      const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        debugProtection: true, // Prevents DevTools from being used
        debugProtectionInterval: 2000,
        disableConsoleOutput: true,
        identifierNamesGenerator: 'hexadecimal',
        log: false,
        numbersToExpressions: true,
        renameGlobals: false,
        selfDefending: true,
        simplify: true,
        splitStrings: true,
        splitStringsChunkLength: 10,
        stringArray: true,
        stringArrayCallsTransform: true,
        stringArrayCallsTransformThreshold: 0.5,
        stringArrayEncoding: ['base64'],
        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        stringArrayWrappersCount: 1,
        stringArrayWrappersChainedCalls: true,
        stringArrayWrappersParametersMaxCount: 2,
        stringArrayWrappersType: 'variable',
        stringArrayThreshold: 0.75,
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
