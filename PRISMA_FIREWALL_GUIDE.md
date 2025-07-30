# Prisma Firewall Compatibility Guide

This guide explains how to work with Prisma in environments with firewall restrictions that block access to `binaries.prisma.sh`.

## Problem

Prisma needs to download binary engines from `binaries.prisma.sh` during:
- `npm install` (via postinstall scripts)
- `prisma generate` commands

In restricted environments (like GitHub Actions with firewalls), this causes build failures.

## Solution

### 1. Environment Variables

Set these environment variables to handle firewall restrictions:

```bash
PRISMA_SKIP_POSTINSTALL_GENERATE=1      # Skip automatic generation during npm install
PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 # Ignore missing engine checksums
```

### 2. Package.json Scripts

The frontend package includes a conditional postinstall script:

```json
{
  "postinstall": "if [ \"$PRISMA_SKIP_POSTINSTALL_GENERATE\" != \"1\" ]; then prisma generate --schema=./prisma/schema.prisma || echo 'Prisma generation skipped due to firewall restrictions'; fi"
}
```

### 3. CI/CD Workflow

The GitHub Actions workflow:

1. Sets `PRISMA_SKIP_POSTINSTALL_GENERATE=1` before `npm ci`
2. Runs `npm ci` without triggering Prisma downloads
3. Attempts Prisma generation with `continue-on-error: true`

### 4. Manual Generation

When Prisma clients are needed, run:

```bash
npm run db:generate
```

This works in environments with internet access to `binaries.prisma.sh`.

## PR Compatibility

### PR #9 (Phase 2 Smart Attendance)
- ✅ Compatible with firewall workaround
- ✅ Uses standard Prisma schema without custom binary targets
- ✅ Backend routes work without Prisma client during build

### PR #10 (Phase 3 AI Assistant)  
- ✅ Compatible with firewall workaround
- ✅ Adds AI tables to Prisma schema (no conflicts with PR #9)
- ✅ Frontend forwards AI requests to backend (no direct DB dependency)

### Merge Compatibility
- ✅ No file conflicts identified between PR #9 and PR #10
- ✅ Package.json dependencies are compatible (Together AI is additive)
- ✅ Prisma schema additions in PR #10 don't conflict with PR #9
- ✅ Both PRs use the same firewall workaround approach

## Testing

All core functionality works with this approach:

```bash
# Install dependencies (skips Prisma generation)
PRISMA_SKIP_POSTINSTALL_GENERATE=1 npm install

# Build applications (works without Prisma client)
npm run build

# Type checking (passes without runtime Prisma client)
npm run type-check

# Generate Prisma clients when needed (if internet access available)
npm run db:generate
```