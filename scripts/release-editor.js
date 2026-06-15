const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const editorDir = path.join(repoRoot, 'app');
const editorPackagePath = path.join(editorDir, 'package.json');
const typeDefinitionsPath = path.join(editorDir, 'types', 'index.d.ts');
const lernaConfigPath = path.join(repoRoot, 'lerna.json');
const packageLockPath = path.join(repoRoot, 'package-lock.json');

const isWindows = process.platform === 'win32';
const cmdCommand = process.env.ComSpec || 'cmd.exe';
const releaseTypes = new Set(['major', 'minor', 'patch']);
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const safeNpmArgPattern = /^[A-Za-z0-9_./:@+-]+$/;

function printUsage() {
  console.log(`Usage:
  npm run version:editor -- <version|major|minor|patch>
  npm run release:editor:dry -- <version|major|minor|patch>
  npm run release:editor -- <version|major|minor|patch>

Examples:
  npm run version:editor -- 3.3.1
  npm run release:editor:dry -- patch
  npm run release:editor -- 3.3.1

Options:
  --version <version>  Explicit version, same as the positional value
  --dry-run           Run npm pack in dry-run mode
  --no-publish        Update release metadata without publishing
  --skip-types        Skip editor TypeScript checks
  --skip-build        Skip the editor production build
  --tag <tag>         npm publish dist-tag, defaults to latest
  --access <access>   npm publish access, defaults to public
  --help              Show this help message`);
}

function fail(message) {
  console.error(`release-editor: ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Could not read ${path.relative(repoRoot, filePath)}: ${error.message}`);
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function readRequiredValue(args, index, optionName) {
  const value = args[index + 1];

  if (!value || value.startsWith('--')) {
    fail(`Missing value for ${optionName}`);
  }

  return value;
}

function parseArgs(args) {
  const options = {
    access: 'public',
    dryRun: false,
    noPublish: false,
    skipBuild: false,
    skipTypes: false,
    tag: 'latest',
    targetVersion: '',
  };
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-publish') {
      options.noPublish = true;
    } else if (arg === '--skip-types') {
      options.skipTypes = true;
    } else if (arg === '--skip-build') {
      options.skipBuild = true;
    } else if (arg === '--version') {
      options.targetVersion = readRequiredValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith('--version=')) {
      options.targetVersion = arg.slice('--version='.length);
    } else if (arg === '--tag') {
      options.tag = readRequiredValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith('--tag=')) {
      options.tag = arg.slice('--tag='.length);
    } else if (arg === '--access') {
      options.access = readRequiredValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith('--access=')) {
      options.access = arg.slice('--access='.length);
    } else if (arg.startsWith('--')) {
      fail(`Unknown option ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length > 1) {
    fail(`Expected one version value, received: ${positionals.join(', ')}`);
  }

  if (!options.targetVersion && positionals.length === 1) {
    options.targetVersion = positionals[0];
  }

  if (!safeNpmArgPattern.test(options.tag)) {
    fail(`Invalid npm tag: ${options.tag}`);
  }

  if (!['public', 'restricted'].includes(options.access)) {
    fail(`Invalid npm access: ${options.access}`);
  }

  return options;
}

function parseSemver(version) {
  const match = semverPattern.exec(version);

  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpVersion(currentVersion, releaseType) {
  const current = parseSemver(currentVersion);

  if (!current) {
    fail(`Current editor version is not valid semver: ${currentVersion}`);
  }

  if (releaseType === 'major') {
    return `${current.major + 1}.0.0`;
  }

  if (releaseType === 'minor') {
    return `${current.major}.${current.minor + 1}.0`;
  }

  return `${current.major}.${current.minor}.${current.patch + 1}`;
}

function resolveVersion(targetVersion, currentVersion) {
  if (!targetVersion) {
    fail('Missing target version. Pass a semver value, or major/minor/patch.');
  }

  if (releaseTypes.has(targetVersion)) {
    return bumpVersion(currentVersion, targetVersion);
  }

  if (!semverPattern.test(targetVersion)) {
    fail(`Invalid target version: ${targetVersion}`);
  }

  return targetVersion;
}

function updateTypeDefinitions(version) {
  const source = fs.readFileSync(typeDefinitionsPath, 'utf8');
  const headerPattern = /^\/\/ Type definitions for TOAST UI Editor v[^\r\n]+/m;

  if (!headerPattern.test(source)) {
    fail(`Could not find the type definition version header in ${path.relative(repoRoot, typeDefinitionsPath)}`);
  }

  const nextSource = source.replace(headerPattern, `// Type definitions for TOAST UI Editor v${version}`);
  fs.writeFileSync(typeDefinitionsPath, nextSource);
}

function updateLernaConfig(version) {
  if (!fs.existsSync(lernaConfigPath)) {
    return false;
  }

  readJson(lernaConfigPath);

  const source = fs.readFileSync(lernaConfigPath, 'utf8');
  const nextSource = source.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);

  if (nextSource === source && !source.includes(`"version": "${version}"`)) {
    fail(`Could not find the version field in ${path.relative(repoRoot, lernaConfigPath)}`);
  }

  fs.writeFileSync(lernaConfigPath, nextSource);

  return true;
}

function updatePackageLock(packageName, version) {
  if (!fs.existsSync(packageLockPath)) {
    return false;
  }

  const packageLock = readJson(packageLockPath);
  let changed = false;

  if (packageLock.packages && packageLock.packages.app && packageLock.packages.app.name === packageName) {
    packageLock.packages.app.version = version;
    changed = true;
  }

  if (
    packageLock.packages &&
    packageLock.packages[`node_modules/${packageName}`] &&
    packageLock.packages[`node_modules/${packageName}`].version
  ) {
    packageLock.packages[`node_modules/${packageName}`].version = version;
    changed = true;
  }

  if (
    packageLock.dependencies &&
    packageLock.dependencies[packageName] &&
    packageLock.dependencies[packageName].version &&
    packageLock.dependencies[packageName].version !== 'file:app'
  ) {
    packageLock.dependencies[packageName].version = version;
    changed = true;
  }

  if (changed) {
    writeJson(packageLockPath, packageLock);
  }

  return changed;
}

function runCommand(label, command, args, options) {
  console.log(`\n> ${label}`);

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    fail(`${label} failed with exit code ${result.status}`);
  }
}

function getNpmInvocation(args) {
  if (!isWindows) {
    return {
      command: 'npm',
      args,
    };
  }

  args.forEach((arg) => {
    if (!safeNpmArgPattern.test(arg)) {
      fail(`Invalid npm argument: ${arg}`);
    }
  });

  return {
    command: cmdCommand,
    args: ['/d', '/s', '/c', ['npm', ...args].join(' ')],
  };
}

function runNpm(label, args, options) {
  const npmInvocation = getNpmInvocation(args);

  runCommand(label, npmInvocation.command, npmInvocation.args, options);
}

function commandSucceeds(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });

  if (result.error) {
    fail(result.error.message);
  }

  return result.status === 0;
}

function checkPublishVersion(packageName, version) {
  const packageSpec = `${packageName}@${version}`;
  const npmInvocation = getNpmInvocation(['view', packageSpec, 'version']);
  const isPublished = commandSucceeds(npmInvocation.command, npmInvocation.args);

  if (isPublished) {
    fail(`${packageSpec} is already published. Choose a new version.`);
  }
}

function runEditorScript(scriptName) {
  runNpm(`npm run ${scriptName} (type=editor)`, ['run', scriptName], {
    env: {
      ...process.env,
      type: 'editor',
    },
  });
}

function publishEditor(options) {
  if (options.dryRun) {
    runNpm('npm pack --dry-run', ['pack', '--dry-run'], {
      cwd: editorDir,
    });
    return;
  }

  const publishArgs = ['publish', '--tag', options.tag];

  if (options.access) {
    publishArgs.push('--access', options.access);
  }

  runNpm(`npm ${publishArgs.join(' ')}`, publishArgs, {
    cwd: editorDir,
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const editorPackage = readJson(editorPackagePath);
  const version = resolveVersion(options.targetVersion, editorPackage.version);

  if (!options.noPublish && !options.dryRun) {
    checkPublishVersion(editorPackage.name, version);
  }

  editorPackage.version = version;
  writeJson(editorPackagePath, editorPackage);
  updateTypeDefinitions(version);
  updateLernaConfig(version);
  updatePackageLock(editorPackage.name, version);

  console.log(`Prepared ${editorPackage.name}@${version}`);

  if (!options.skipTypes) {
    runEditorScript('test:types');
  }

  if (!options.skipBuild) {
    runEditorScript('build');
  }

  if (options.noPublish) {
    console.log('\nRelease metadata updated. Publishing skipped.');
    return;
  }

  publishEditor(options);
}

main();