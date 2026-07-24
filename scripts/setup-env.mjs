import { access, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const source = '.env.example';
const target = '.env.local';

try {
  await access(target, constants.F_OK);
  console.log(`${target} already exists; nothing was changed.`);
} catch {
  await copyFile(source, target);
  console.log(`Created ${target} from ${source}. Add only the optional keys you use.`);
}
