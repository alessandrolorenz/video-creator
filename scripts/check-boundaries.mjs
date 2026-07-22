import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const BINARY_FIXTURE_EXTENSIONS = new Set([
  '.7z',
  '.avi',
  '.bin',
  '.bmp',
  '.flac',
  '.gif',
  '.gz',
  '.jpeg',
  '.jpg',
  '.m4a',
  '.mkv',
  '.mov',
  '.mp3',
  '.mp4',
  '.ogg',
  '.pdf',
  '.png',
  '.tar',
  '.tiff',
  '.wav',
  '.webm',
  '.webp',
  '.zip',
]);
const IGNORED_DIRECTORIES = new Set(['.git', '.pnpm-store', 'coverage', 'dist', 'node_modules']);
const FRAMEWORK_INDEPENDENT = new Set([
  'domain',
  'timeline',
  'media',
  'transcript',
  'ai-contracts',
  'export',
]);
const NODE_MODULES = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));
const FORBIDDEN_FRAMEWORK_OR_PROVIDER_IMPORT =
  /^(?:electron|react(?:-dom)?|openai(?:\/|$)|@anthropic-ai\/|@google\/generative-ai|@ai-sdk\/|fluent-ffmpeg|ffmpeg(?:\/|$))/;
const FORBIDDEN_DEPENDENCY =
  /(?:ffmpeg|fluent-ffmpeg|openai|anthropic|generative-ai|ai-sdk|sqlite|better-sqlite|prisma|typeorm|electron-builder|electron-forge|sentry|telemetry)/i;
const FORBIDDEN_FRAMEWORK_DEPENDENCY = /^(?:electron|react|react-dom|@types\/node)$/;

function toPosix(path) {
  return path.split(sep).join('/');
}

function isInside(path, directory) {
  const difference = relative(directory, path);
  return difference === '' || (!difference.startsWith(`..${sep}`) && difference !== '..');
}

async function walk(directory, files = []) {
  if (!existsSync(directory)) return files;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path, files);
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function repositoryVisibleFiles(root) {
  try {
    const output = execFileSync(
      'git',
      ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    return output
      .split('\0')
      .filter((path) => path.length > 0)
      .map((path) => join(root, path))
      .filter(existsSync);
  } catch {
    return walk(root);
  }
}

async function loadWorkspaces(root) {
  const workspaces = [];
  for (const parentName of ['apps', 'packages']) {
    const parent = join(root, parentName);
    if (!existsSync(parent)) continue;
    const entries = await readdir(parent, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const workspaceRoot = join(parent, entry.name);
      const manifestPath = join(workspaceRoot, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      workspaces.push({
        directoryName: entry.name,
        manifest,
        manifestPath,
        name: manifest.name,
        root: workspaceRoot,
      });
    }
  }
  return workspaces;
}

function importedSpecifiers(source, path) {
  const kind = ['.tsx', '.jsx'].includes(extname(path)) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
  const imports = [];

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause;
      const namedBindings = clause?.namedBindings;
      const onlyNamedTypeImports =
        clause &&
        !clause.name &&
        namedBindings &&
        ts.isNamedImports(namedBindings) &&
        namedBindings.elements.length > 0 &&
        namedBindings.elements.every((element) => element.isTypeOnly);
      imports.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: Boolean(clause?.isTypeOnly || onlyNamedTypeImports),
      });
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      imports.push({ specifier: node.moduleSpecifier.text, typeOnly: node.isTypeOnly });
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const argument = node.arguments[0];
      if (
        argument &&
        ts.isStringLiteralLike(argument) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        imports.push({ specifier: argument.text, typeOnly: false });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { imports, sourceFile };
}

function workspaceForSpecifier(specifier, workspaces) {
  return workspaces.find(
    (workspace) =>
      typeof workspace.name === 'string' &&
      (specifier === workspace.name || specifier.startsWith(`${workspace.name}/`)),
  );
}

function declaredDependencies(manifest) {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ]);
}

function isAllowedWorkspaceEdge(source, target) {
  if (source.directoryName === 'domain' || source.directoryName === 'export') return false;
  if (source.directoryName === 'timeline' || source.directoryName === 'transcript') {
    return target.directoryName === 'domain';
  }
  if (source.directoryName === 'media' || source.directoryName === 'ai-contracts') {
    return target.directoryName === 'domain';
  }
  return true;
}

function exportPackageHasPublicSymbols(sourceFile) {
  return sourceFile.statements.some((statement) => {
    if (ts.isExportAssignment(statement)) return true;
    if (ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier) return true;
      return !statement.exportClause || statement.exportClause.elements.length > 0;
    }
    return Boolean(
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
    );
  });
}

function sourceUsesIdentifier(sourceFile, identifier) {
  let found = false;
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === identifier) found = true;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

async function checkManifestDependencies(workspaces, errors, root) {
  for (const workspace of workspaces) {
    const groups = [
      workspace.manifest.dependencies,
      workspace.manifest.devDependencies,
      workspace.manifest.peerDependencies,
      workspace.manifest.optionalDependencies,
    ];
    for (const group of groups) {
      for (const dependency of Object.keys(group ?? {})) {
        if (FORBIDDEN_DEPENDENCY.test(dependency)) {
          errors.push(
            `${toPosix(relative(root, workspace.manifestPath))}: forbidden repository dependency ${dependency}`,
          );
        }
        if (
          FRAMEWORK_INDEPENDENT.has(workspace.directoryName) &&
          FORBIDDEN_FRAMEWORK_DEPENDENCY.test(dependency)
        ) {
          errors.push(
            `${toPosix(relative(root, workspace.manifestPath))}: framework-independent package declares forbidden dependency ${dependency}`,
          );
        }
        const target = workspaceForSpecifier(dependency, workspaces);
        if (target && !isAllowedWorkspaceEdge(workspace, target)) {
          errors.push(
            `${toPosix(relative(root, workspace.manifestPath))}: ${workspace.directoryName} must not depend on workspace package ${target.name}`,
          );
        }
      }
    }
  }
}

async function checkSources(workspaces, errors, root) {
  for (const workspace of workspaces) {
    const sourceRoot = join(workspace.root, 'src');
    const files = (await walk(sourceRoot)).filter((path) => SOURCE_EXTENSIONS.has(extname(path)));
    const declarations = declaredDependencies(workspace.manifest);

    for (const path of files) {
      const source = await readFile(path, 'utf8');
      const { imports, sourceFile } = importedSpecifiers(source, path);
      const displayPath = toPosix(relative(root, path));

      if (workspace.directoryName === 'export' && exportPackageHasPublicSymbols(sourceFile)) {
        errors.push(`${displayPath}: export package must not expose public symbols`);
      }

      const isTestSource = /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
      const isExactDesktopPrivilegedSource =
        workspace.directoryName === 'desktop' &&
        (isInside(path, join(workspace.root, 'src', 'main')) ||
          isInside(path, join(workspace.root, 'src', 'worker')));
      const usesProcess = sourceUsesIdentifier(sourceFile, 'process');
      if (FRAMEWORK_INDEPENDENT.has(workspace.directoryName) && usesProcess) {
        errors.push(`${displayPath}: framework-independent package uses forbidden process global`);
      }
      if (
        workspace.directoryName === 'desktop' &&
        usesProcess &&
        !isTestSource &&
        !isExactDesktopPrivilegedSource
      ) {
        errors.push(
          `${displayPath}: desktop runtime source outside exact main/worker ownership uses forbidden process global`,
        );
      }

      for (const importEdge of imports) {
        const { specifier } = importEdge;
        const rootSpecifier = specifier.replace(/^node:/, '').split('/')[0];
        const isNodeImport = NODE_MODULES.has(rootSpecifier);
        if (workspace.directoryName === 'export') {
          errors.push(`${displayPath}: export package must not import ${specifier}`);
        }
        if (FRAMEWORK_INDEPENDENT.has(workspace.directoryName)) {
          if (isNodeImport || FORBIDDEN_FRAMEWORK_OR_PROVIDER_IMPORT.test(specifier)) {
            errors.push(
              `${displayPath}: framework-independent package imports forbidden ${specifier}`,
            );
          }
          if (specifier.startsWith('apps/') || specifier.includes('/apps/')) {
            errors.push(`${displayPath}: framework-independent package imports application source`);
          }
        }
        if (
          workspace.directoryName === 'desktop' &&
          isNodeImport &&
          !isTestSource &&
          !isExactDesktopPrivilegedSource
        ) {
          errors.push(
            `${displayPath}: desktop runtime source outside exact main/worker ownership imports forbidden ${specifier}`,
          );
        }

        const target = workspaceForSpecifier(specifier, workspaces);
        if (target) {
          if (!isAllowedWorkspaceEdge(workspace, target)) {
            errors.push(
              `${displayPath}: ${workspace.directoryName} must not import workspace package ${target.name}`,
            );
          }
          if (!declarations.has(target.name)) {
            errors.push(`${displayPath}: workspace dependency ${target.name} is not declared`);
          }
          if (
            workspace.directoryName === 'ai-contracts' &&
            target.directoryName === 'domain' &&
            !importEdge.typeOnly
          ) {
            errors.push(`${displayPath}: ${workspace.directoryName} may import domain types only`);
          }
          continue;
        }

        if (specifier.startsWith('.')) {
          const resolvedTarget = resolve(dirname(path), specifier);
          const targetWorkspace = workspaces.find(
            (candidate) => candidate !== workspace && isInside(resolvedTarget, candidate.root),
          );
          if (targetWorkspace) {
            errors.push(
              `${displayPath}: cross-package relative import into ${targetWorkspace.directoryName}`,
            );
          }
          if (
            FRAMEWORK_INDEPENDENT.has(workspace.directoryName) &&
            isInside(resolvedTarget, join(root, 'apps'))
          ) {
            errors.push(`${displayPath}: framework-independent package imports application source`);
          }
        }
      }
    }
  }
}

async function checkFixtures(root, errors) {
  const fixtureRoot = join(root, 'packages', 'fixtures');
  if (existsSync(fixtureRoot)) {
    errors.push('packages/fixtures is forbidden by repository policy');
  }

  for (const path of await repositoryVisibleFiles(root)) {
    const displayPath = toPosix(relative(root, path));
    if (BINARY_FIXTURE_EXTENSIONS.has(extname(path).toLowerCase())) {
      errors.push(`binary fixture is forbidden by repository policy: ${displayPath}`);
    }

    const contents = await readFile(path);
    const prefix = contents.subarray(0, 200).toString('utf8');
    if (prefix.startsWith('version https://git-lfs.github.com/spec/v1\n')) {
      errors.push(`Git LFS pointer is forbidden by repository policy: ${displayPath}`);
    }
    if (displayPath === '.gitattributes' && /(?:^|\s)filter=lfs(?:\s|$)/m.test(prefix)) {
      errors.push('Git LFS configuration is forbidden by repository policy');
    }
    if (!BINARY_FIXTURE_EXTENSIONS.has(extname(path).toLowerCase()) && contents.includes(0)) {
      errors.push(`binary content is forbidden by repository policy: ${displayPath}`);
    }
  }
}

export async function checkRepository(root) {
  const normalizedRoot = resolve(root);
  const errors = [];
  const workspaces = await loadWorkspaces(normalizedRoot);
  const rootManifestPath = join(normalizedRoot, 'package.json');
  const rootManifest = existsSync(rootManifestPath)
    ? {
        directoryName: 'root',
        manifest: JSON.parse(await readFile(rootManifestPath, 'utf8')),
        manifestPath: rootManifestPath,
        name: undefined,
        root: normalizedRoot,
      }
    : undefined;

  await checkManifestDependencies(
    rootManifest ? [rootManifest, ...workspaces] : workspaces,
    errors,
    normalizedRoot,
  );
  await checkSources(workspaces, errors, normalizedRoot);
  await checkFixtures(normalizedRoot, errors);

  return errors.sort();
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
  const errors = await checkRepository(root);
  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR ${error}`);
    process.exitCode = 1;
  } else {
    console.log('Repository boundaries: PASS');
  }
}
