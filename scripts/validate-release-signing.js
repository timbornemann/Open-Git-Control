#!/usr/bin/env node

const platform = String(process.argv[2] || '')
  .trim()
  .toLowerCase();
const requiredByPlatform = {
  windows: ['CSC_LINK', 'CSC_KEY_PASSWORD'],
  macos: ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'],
};

const required = requiredByPlatform[platform];
if (!required) {
  console.error('Usage: node scripts/validate-release-signing.js <windows|macos>');
  process.exit(1);
}

const missing = required.filter((name) => !String(process.env[name] || '').trim());
if (missing.length > 0) {
  console.error(`Missing required signing configuration for ${platform}: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`Signing configuration for ${platform} is present.`);
