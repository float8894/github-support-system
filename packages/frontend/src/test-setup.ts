import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
  { teardown: { destroyAfterEach: true } },
);

// Build a map of filename → absolute path for all .html and .scss files under src/
const resourceCache = new Map<string, string>();

function indexResources(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      indexResources(full);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.html') || entry.name.endsWith('.scss'))
    ) {
      resourceCache.set(entry.name, full);
    }
  }
}

indexResources(join(process.cwd(), 'src'));

// Resolve templateUrl/styleUrl for JIT-compiled components in Vitest (no build plugin)
await resolveComponentResources((url: string) => {
  const fileName = basename(url);
  const filePath = resourceCache.get(fileName);
  const content = filePath ? readFileSync(filePath, 'utf-8') : '';
  return Promise.resolve({ text: () => Promise.resolve(content) });
});
