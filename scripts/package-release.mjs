import { createWriteStream } from "fs";
import { mkdirSync, rmSync, copyFileSync, readFileSync } from "fs";
import path from "path";
import yazl from "yazl";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const pluginId = manifest.id;
const version = manifest.version || packageJson.version;
const releaseDir = path.join("release");
const stagingDir = path.join(releaseDir, pluginId);
const zipPath = path.join(releaseDir, `${packageJson.name}-${version}.zip`);

rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });

for (const file of ["manifest.json", "main.js", "styles.css"]) {
  copyFileSync(file, path.join(stagingDir, file));
}

const zip = new yazl.ZipFile();
for (const file of ["manifest.json", "main.js", "styles.css"]) {
  zip.addFile(path.join(stagingDir, file), `${pluginId}/${file}`);
}

await new Promise((resolve, reject) => {
  zip.outputStream
    .pipe(createWriteStream(zipPath))
    .on("close", resolve)
    .on("error", reject);
  zip.end();
});

console.log(`Created ${zipPath}`);
