import packageJson from '../package.json';

/**
 * Centralized Code & Build Versioning
 * Option 1 + 2: Combines semantic release versioning from package.json
 * with build timestamp / build identifier injection.
 */
export const APP_VERSION = packageJson.version || "0.86.0";

// Build metadata (resolved at app compilation / module evaluation)
export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : Date.now().toString(36).toUpperCase();
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();

export const FULL_VERSION_STRING = `v${APP_VERSION}+build.${BUILD_ID}`;
