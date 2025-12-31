# GitHub Actions Workflows

This repository includes GitHub Actions workflows for CI/CD.

## Workflows

### CI (`ci.yml`)
Runs on every push and pull request to main/master branches:
- Installs dependencies using pnpm
- Builds the package
- Runs tests

### Publish (`publish.yml`)
Publishes the package to npm. Triggers:
- **Automatic**: When a version tag is pushed (e.g., `v0.1.0`)
- **Manual**: Via workflow dispatch with a version input

## Setup for Publishing

To enable publishing to npm, you need to:

1. **Create an npm access token**:
   - Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Create a new "Automation" token
   - Copy the token

2. **Add the token as a GitHub secret**:
   - Go to your repository settings
   - Navigate to Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Your npm access token
   - Click "Add secret"

## Publishing a New Version

### Option 1: Using Git Tags (Recommended)

1. Update the version in `package.json`
2. Commit and push the changes
3. Create and push a version tag:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
4. The workflow will automatically:
   - Extract the version from the tag
   - Build the package
   - Publish to npm
   - Create a GitHub release

### Option 2: Manual Workflow Dispatch

1. Go to the Actions tab in GitHub
2. Select "Publish to npm" workflow
3. Click "Run workflow"
4. Enter the version number (e.g., `0.1.0`)
5. Click "Run workflow"
6. The workflow will:
   - Update `package.json` version
   - Build the package
   - Publish to npm

## Notes

- The workflow uses pnpm version 10.10.0 (as specified in `package.json`)
- The package is published with `--access public` flag
- GitHub releases are automatically created when publishing via tags

