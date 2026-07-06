const fs = require('fs');
const path = require('path');

const REMOVE = [
  'dxcompiler.dll',
  'dxil.dll',
  'LICENSES.chromium.html',
];

exports.default = async function afterPack(context) {
  const dir = context.appOutDir;
  for (const name of REMOVE) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      const mb = (fs.statSync(p).size / 1024 / 1024).toFixed(2);
      fs.rmSync(p, { force: true });
      console.log(`  \u2022 stripped ${name} (${mb} MB)`);
    }
  }
};
