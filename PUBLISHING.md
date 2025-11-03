# Publishing Checklist

## Before Publishing to npm

### 1. Update package.json

- [ ] Set correct `author` field
- [ ] Update `repository.url` with your GitHub repo
- [ ] Update `bugs.url` with your GitHub issues URL
- [ ] Update `homepage` with your GitHub readme URL
- [ ] Verify version number follows semver

### 2. Test Locally

```bash
# Link package locally
npm link

# Test in another directory
cd /tmp/test-project
npm link dotplan
npx dotplan init
npx dotplan create "Test"

# Unlink when done
npm unlink -g dotplan
```

### 3. Verify Files

```bash
# Check what will be published
npm pack --dry-run

# Should include:
# - bin/
# - src/
# - package.json
# - README.md
# - LICENSE

# Should NOT include:
# - node_modules/
# - .plan/
# - tests/
```

### 4. Add .npmignore (if needed)

Create `.npmignore`:
```
.plan/
tests/
.git/
.github/
*.test.js
.eslintrc.*
```

### 5. Test with npx

```bash
# Build tarball
npm pack

# Test with tarball
npx dotplan-0.1.0.tgz init
```

### 6. Publish

```bash
# Login to npm (first time only)
npm login

# Publish (dry run first)
npm publish --dry-run

# Actually publish
npm publish

# Or for scoped package
npm publish --access public
```

### 7. Verify

```bash
# Wait a few minutes, then test
npx dotplan@latest init
```

## Version Updates

```bash
# Patch (0.1.0 -> 0.1.1)
npm version patch

# Minor (0.1.0 -> 0.2.0)
npm version minor

# Major (0.1.0 -> 1.0.0)
npm version major

# Then publish
npm publish
```

## Post-Publishing

- [ ] Create GitHub release with same version tag
- [ ] Update README badges if needed
- [ ] Announce on Twitter/Discord
- [ ] Add to relevant lists (awesome-ai-tools, etc.)
