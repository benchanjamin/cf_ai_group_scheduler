#!/usr/bin/env node

/**
 * Post-build script to add Durable Object exports to the generated worker file
 * This is necessary because SvelteKit's Cloudflare adapter doesn't automatically
 * re-export Durable Objects from hooks.server.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const workerPath = join(projectRoot, '.svelte-kit/cloudflare/_worker.js');

try {
	let workerContent = readFileSync(workerPath, 'utf-8');

	// Check if already patched
	if (workerContent.includes('import { MeetingScheduler }')) {
		console.log('✓ Worker file already has Durable Object exports');
		process.exit(0);
	}

	// Add import statement after other imports
	const importSection = 'import { env } from "cloudflare:workers";';
	const newImport = 'import { MeetingScheduler } from "../output/server/chunks/hooks.server.js";';

	if (workerContent.includes(importSection)) {
		workerContent = workerContent.replace(
			importSection,
			`${importSection}\n${newImport}`
		);
	} else {
		console.error('✗ Could not find import section in worker file');
		process.exit(1);
	}

	// Add export statement
	const exportSection = 'export {\n  worker_default as default\n};';
	const newExport = 'export {\n  worker_default as default,\n  MeetingScheduler\n};';

	if (workerContent.includes(exportSection)) {
		workerContent = workerContent.replace(exportSection, newExport);
	} else {
		console.error('✗ Could not find export section in worker file');
		process.exit(1);
	}

	// Write the modified content back
	writeFileSync(workerPath, workerContent, 'utf-8');
	console.log('✓ Added Durable Object exports to worker file');
} catch (error) {
	console.error('✗ Error patching worker file:', error.message);
	process.exit(1);
}
