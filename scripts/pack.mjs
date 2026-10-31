import { readFile, writeFile, readdir } from "node:fs/promises";
import { deflateRawSync } from "node:zlib";
const root = new URL("../", import.meta.url);
const paths = ["index.js", "index.css", "plugin.json", "icon.png", "assets/icon.svg", "README.md", "LICENSE"];
for (const name of (await readdir(new URL("i18n/", root))).sort()) if (name.endsWith(".json")) paths.push(`i18n/${name}`);
const table = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(bytes) { let value = 0xffffffff; for (const byte of bytes) value = table[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; }
const local = [], central = [];
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
let offset = 0;
for (const path of paths) {
  const data = await readFile(new URL(path, root));
  const packed = deflateRawSync(data); const name = Buffer.from(path); const crc = crc32(data);
  const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x800, 6); head.writeUInt16LE(8, 8);
  head.writeUInt16LE(dosTime, 10); head.writeUInt16LE(dosDate, 12);
  head.writeUInt32LE(crc, 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26);
  const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(8, 10);
  directory.writeUInt16LE(dosTime, 12); directory.writeUInt16LE(dosDate, 14);
  directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(packed.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
  local.push(head, name, packed); central.push(directory, name); offset += head.length + name.length + packed.length;
}
const directory = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(paths.length, 8); end.writeUInt16LE(paths.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
await writeFile(new URL("package.zip", root), Buffer.concat([...local, directory, end]));
console.log(`Packaged ${paths.length} files → package.zip`);
