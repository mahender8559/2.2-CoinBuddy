import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, content) => fs.writeFileSync(file, content);

function replaceOnce(file, before, after) {
  const source = read(file);
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Expected source not found in ${file}: ${before.slice(0, 120)}`);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Expected source is not unique in ${file}: ${before.slice(0, 120)}`);
  write(file, source.slice(0, index) + after + source.slice(index + before.length));
}

function insertBefore(file, marker, insertion) {
  const source = read(file);
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Marker not found in ${file}: ${marker}`);
  write(file, source.slice(0, index) + insertion + source.slice(index));
}

function replaceBetween(file, startMarker, endMarker, replacement) {
  const source = read(file);
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Start marker not found in ${file}: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`End marker not found in ${file}: ${endMarker}`);
  write(file, source.slice(0, start) + replacement + source.slice(end));
}

console.log('Hardening patch runner ready.');
