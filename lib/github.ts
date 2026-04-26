import { Octokit } from '@octokit/rest';

/**
 * GitHub helper. Drives changesets against the GitOps repo (env-configured)
 * via Octokit. Two modes: 'pr' (open PR) or 'direct' (commit to default branch).
 */

export interface FileChange {
  path: string;
  /** New full content. `null` deletes the file. */
  content: string | null;
}

export interface CreateWorldChangesetInput {
  org: string;
  world: string;
  env: 'pre' | 'pro';
  files: FileChange[];
  parentKustomization: {
    path: string;
    addEntry: string;
  };
  commitMessage: string;
  mode: 'pr' | 'direct';
}

export interface DeleteWorldChangesetInput {
  org: string;
  world: string;
  env: 'pre' | 'pro';
  pathsToDelete: string[];
  parentKustomization: {
    path: string;
    removeEntry: string;
  };
  commitMessage: string;
  mode: 'pr' | 'direct';
}

export interface ChangesetResult {
  mode: 'pr' | 'direct';
  prUrl?: string;
  prNumber?: number;
  commitSha?: string;
  branch: string;
}

// ---------------------------------------------------------------------------
// Internal: env + octokit singleton
// ---------------------------------------------------------------------------

interface RepoConfig {
  owner: string;
  repo: string;
  baseBranch: string;
}

let _octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (_octokit) return _octokit;
  const token = process.env.GITHUB_TOKEN;
  if (!token || token.trim() === '') {
    throw new Error('GITHUB_TOKEN must be set in the environment');
  }
  _octokit = new Octokit({ auth: token });
  return _octokit;
}

function getRepoConfig(): RepoConfig {
  const owner = process.env.GITHUB_OWNER ?? '';
  const repo = process.env.GITHUB_REPO ?? '';
  if (!owner || !repo) {
    throw new Error('GITHUB_OWNER and GITHUB_REPO must be set in the environment');
  }
  return {
    owner,
    repo,
    baseBranch: process.env.GITHUB_BASE_BRANCH ?? 'main',
  };
}

// ---------------------------------------------------------------------------
// Internal helpers — error wrapping
// ---------------------------------------------------------------------------

function wrapError(op: string, err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(`GitHub ${op} failed: ${message}`);
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const status = (err as { status?: number }).status;
  return status === 404;
}

// ---------------------------------------------------------------------------
// Internal: parent kustomization mutation
// ---------------------------------------------------------------------------

/**
 * Add or remove a single entry from a kustomization.yaml's `resources:` list,
 * preserving the rest of the file. Idempotent: existing entries aren't
 * duplicated; missing ones are no-ops on remove.
 */
function mutateParentKustomization(
  originalContent: string,
  opts: { addEntry?: string; removeEntry?: string },
): string {
  const { addEntry, removeEntry } = opts;
  if (!addEntry && !removeEntry) return originalContent;

  // Preserve trailing newline state.
  const hasTrailingNewline = originalContent.endsWith('\n');
  const lines = originalContent.split('\n');
  // If the file ended with \n, split produces a trailing empty string we must drop.
  if (hasTrailingNewline && lines[lines.length - 1] === '') lines.pop();

  const resourcesIdx = lines.findIndex((l) => /^resources\s*:\s*$/.test(l));

  if (resourcesIdx === -1) {
    // No `resources:` block found.
    if (removeEntry) return originalContent; // nothing to remove
    if (addEntry) {
      // Append a new `resources:` block at the end.
      const block = ['resources:', `  - ${addEntry}`];
      const out = [...lines, ...block];
      return out.join('\n') + (hasTrailingNewline ? '\n' : '');
    }
    return originalContent;
  }

  // Walk the items under `resources:` (lines that start with `- ` after some
  // leading whitespace). Stop at the first line that is not an item and not
  // an indented continuation/blank.
  const itemRe = /^(\s*)-\s+(.*?)\s*$/;
  let endIdx = resourcesIdx + 1;
  const itemIndices: number[] = [];
  let detectedIndent: string | null = null;

  while (endIdx < lines.length) {
    const line = lines[endIdx];
    if (line === '' || /^\s+/.test(line)) {
      const m = itemRe.exec(line);
      if (m) {
        if (detectedIndent === null) detectedIndent = m[1];
        itemIndices.push(endIdx);
      }
      endIdx += 1;
      continue;
    }
    // A non-indented, non-empty line → end of `resources:` block.
    break;
  }

  const indent = detectedIndent ?? '  ';

  if (removeEntry) {
    const targetIdx = itemIndices.find((i) => {
      const m = itemRe.exec(lines[i]);
      return m !== null && m[2] === removeEntry;
    });
    if (targetIdx === undefined) {
      // Nothing to remove — idempotent.
      return originalContent;
    }
    lines.splice(targetIdx, 1);
    return lines.join('\n') + (hasTrailingNewline ? '\n' : '');
  }

  if (addEntry) {
    const alreadyPresent = itemIndices.some((i) => {
      const m = itemRe.exec(lines[i]);
      return m !== null && m[2] === addEntry;
    });
    if (alreadyPresent) {
      return originalContent;
    }
    const insertAt = itemIndices.length > 0
      ? itemIndices[itemIndices.length - 1] + 1
      : resourcesIdx + 1;
    lines.splice(insertAt, 0, `${indent}- ${addEntry}`);
    return lines.join('\n') + (hasTrailingNewline ? '\n' : '');
  }

  return originalContent;
}

// ---------------------------------------------------------------------------
// Internal: low-level git ops
// ---------------------------------------------------------------------------

interface RefInfo {
  sha: string;
}

async function getBranchHeadSha(
  octokit: Octokit,
  cfg: RepoConfig,
  branch: string,
): Promise<string> {
  const { data } = await octokit.git.getRef({
    owner: cfg.owner,
    repo: cfg.repo,
    ref: `heads/${branch}`,
  });
  return data.object.sha;
}

async function ensureBranch(
  octokit: Octokit,
  cfg: RepoConfig,
  branch: string,
): Promise<RefInfo> {
  // If branch exists, reuse its tip; otherwise create it from base.
  try {
    const sha = await getBranchHeadSha(octokit, cfg, branch);
    return { sha };
  } catch (err) {
    if (!isNotFound(err)) {
      throw wrapError('get branch ref', err);
    }
  }

  let baseSha: string;
  try {
    baseSha = await getBranchHeadSha(octokit, cfg, cfg.baseBranch);
  } catch (err) {
    throw wrapError(`resolve base branch '${cfg.baseBranch}'`, err);
  }

  try {
    await octokit.git.createRef({
      owner: cfg.owner,
      repo: cfg.repo,
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });
  } catch (err) {
    throw wrapError(`create branch '${branch}'`, err);
  }

  return { sha: baseSha };
}

/** Reads a file at the tip of a ref. Returns null on 404. */
async function readFileAtRef(
  octokit: Octokit,
  cfg: RepoConfig,
  path: string,
  ref: string,
): Promise<{ content: string; sha: string } | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner: cfg.owner,
      repo: cfg.repo,
      path,
      ref,
    });
    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error(`path '${path}' is not a file`);
    }
    const raw = (data as { content?: string; encoding?: string }).content ?? '';
    const encoding = (data as { encoding?: string }).encoding ?? 'base64';
    const decoded =
      encoding === 'base64'
        ? Buffer.from(raw.replace(/\n/g, ''), 'base64').toString('utf8')
        : raw;
    return { content: decoded, sha: data.sha };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw wrapError(`read file '${path}'`, err);
  }
}

async function writeFile(
  octokit: Octokit,
  cfg: RepoConfig,
  args: {
    path: string;
    content: string;
    message: string;
    branch: string;
    expectedSha?: string;
  },
): Promise<string> {
  try {
    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner: cfg.owner,
      repo: cfg.repo,
      path: args.path,
      message: args.message,
      content: Buffer.from(args.content, 'utf8').toString('base64'),
      branch: args.branch,
      sha: args.expectedSha,
    });
    return data.commit.sha ?? '';
  } catch (err) {
    throw wrapError(`write file '${args.path}'`, err);
  }
}

async function deleteFile(
  octokit: Octokit,
  cfg: RepoConfig,
  args: { path: string; message: string; branch: string; sha: string },
): Promise<string> {
  try {
    const { data } = await octokit.repos.deleteFile({
      owner: cfg.owner,
      repo: cfg.repo,
      path: args.path,
      message: args.message,
      branch: args.branch,
      sha: args.sha,
    });
    return data.commit.sha ?? '';
  } catch (err) {
    throw wrapError(`delete file '${args.path}'`, err);
  }
}

// ---------------------------------------------------------------------------
// Internal: high-level changeset application
// ---------------------------------------------------------------------------

interface ApplyChangesetArgs {
  branch: string;
  files: FileChange[];
  parent: {
    path: string;
    mutate: (original: string) => string;
  };
  commitMessage: string;
  mode: 'pr' | 'direct';
}

interface ApplyChangesetOutcome {
  branch: string;
  lastCommitSha: string;
}

async function applyChangeset(
  octokit: Octokit,
  cfg: RepoConfig,
  args: ApplyChangesetArgs,
): Promise<ApplyChangesetOutcome> {
  const branch = args.mode === 'direct' ? cfg.baseBranch : args.branch;

  if (args.mode === 'pr') {
    await ensureBranch(octokit, cfg, branch);
  }

  let lastCommitSha = '';

  for (const file of args.files) {
    const existing = await readFileAtRef(octokit, cfg, file.path, branch);

    if (file.content === null) {
      if (existing === null) continue;
      lastCommitSha = await deleteFile(octokit, cfg, {
        path: file.path,
        message: args.commitMessage,
        branch,
        sha: existing.sha,
      });
      continue;
    }

    if (existing && existing.content === file.content) continue;

    lastCommitSha = await writeFile(octokit, cfg, {
      path: file.path,
      content: file.content,
      message: args.commitMessage,
      branch,
      expectedSha: existing?.sha,
    });
  }

  const parent = await readFileAtRef(octokit, cfg, args.parent.path, branch);
  if (parent === null) {
    // 'create': caller misconfiguration. 'delete': parent already gone.
    return { branch, lastCommitSha };
  }
  const updatedParent = args.parent.mutate(parent.content);
  if (updatedParent !== parent.content) {
    lastCommitSha = await writeFile(octokit, cfg, {
      path: args.parent.path,
      content: updatedParent,
      message: args.commitMessage,
      branch,
      expectedSha: parent.sha,
    });
  }

  return { branch, lastCommitSha };
}

async function openPullRequest(
  octokit: Octokit,
  cfg: RepoConfig,
  args: {
    branch: string;
    title: string;
    body: string;
  },
): Promise<{ prUrl: string; prNumber: number }> {
  // Reuse existing open PR for the same head (idempotent).
  try {
    const { data: existing } = await octokit.pulls.list({
      owner: cfg.owner,
      repo: cfg.repo,
      head: `${cfg.owner}:${args.branch}`,
      state: 'open',
      per_page: 1,
    });
    if (existing.length > 0) {
      const pr = existing[0];
      return { prUrl: pr.html_url, prNumber: pr.number };
    }
  } catch (err) {
    throw wrapError('list existing PRs', err);
  }

  try {
    const { data: pr } = await octokit.pulls.create({
      owner: cfg.owner,
      repo: cfg.repo,
      head: args.branch,
      base: cfg.baseBranch,
      title: args.title,
      body: args.body,
    });
    return { prUrl: pr.html_url, prNumber: pr.number };
  } catch (err) {
    throw wrapError('open pull request', err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read a file from the default branch. Returns null if missing. */
export async function readRepoFile(
  path: string,
): Promise<{ content: string; sha: string } | null> {
  const octokit = getOctokit();
  const cfg = getRepoConfig();
  return readFileAtRef(octokit, cfg, path, cfg.baseBranch);
}

/** Apply create-world changeset (mode: PR or direct). */
export async function applyCreateWorldChangeset(
  input: CreateWorldChangesetInput,
): Promise<ChangesetResult> {
  const octokit = getOctokit();
  const cfg = getRepoConfig();

  const branch = `feat/world-${input.org}-${input.world}-${input.env}`;

  const { lastCommitSha } = await applyChangeset(octokit, cfg, {
    branch,
    files: input.files,
    parent: {
      path: input.parentKustomization.path,
      mutate: (original) =>
        mutateParentKustomization(original, {
          addEntry: input.parentKustomization.addEntry,
        }),
    },
    commitMessage: input.commitMessage,
    mode: input.mode,
  });

  if (input.mode === 'direct') {
    return {
      mode: 'direct',
      branch: cfg.baseBranch,
      commitSha: lastCommitSha,
    };
  }

  const title = `feat(world): create ${input.org}/${input.world} (${input.env})`;
  const body = [
    `Adds world **${input.world}** for org **${input.org}** in **${input.env}**.`,
    '',
    '**Files:**',
    ...input.files.map((f) => `- \`${f.path}\``),
    '',
    `**Parent kustomization:** \`${input.parentKustomization.path}\``,
    `**Resources entry:** \`${input.parentKustomization.addEntry}\``,
  ].join('\n');

  const { prUrl, prNumber } = await openPullRequest(octokit, cfg, {
    branch,
    title,
    body,
  });

  return {
    mode: 'pr',
    branch,
    prUrl,
    prNumber,
    commitSha: lastCommitSha || undefined,
  };
}

/** Apply delete-world changeset (mode: PR or direct). */
export async function applyDeleteWorldChangeset(
  input: DeleteWorldChangesetInput,
): Promise<ChangesetResult> {
  const octokit = getOctokit();
  const cfg = getRepoConfig();

  const branch = `chore/delete-world-${input.org}-${input.world}-${input.env}`;

  const files: FileChange[] = input.pathsToDelete.map((p) => ({
    path: p,
    content: null,
  }));

  const { lastCommitSha } = await applyChangeset(octokit, cfg, {
    branch,
    files,
    parent: {
      path: input.parentKustomization.path,
      mutate: (original) =>
        mutateParentKustomization(original, {
          removeEntry: input.parentKustomization.removeEntry,
        }),
    },
    commitMessage: input.commitMessage,
    mode: input.mode,
  });

  if (input.mode === 'direct') {
    return {
      mode: 'direct',
      branch: cfg.baseBranch,
      commitSha: lastCommitSha,
    };
  }

  const title = `chore(world): delete ${input.org}/${input.world} (${input.env})`;
  const body = [
    `Removes world **${input.world}** for org **${input.org}** in **${input.env}**.`,
    '',
    '**Files removed:**',
    ...input.pathsToDelete.map((p) => `- \`${p}\``),
    '',
    `**Parent kustomization:** \`${input.parentKustomization.path}\``,
    `**Resources entry removed:** \`${input.parentKustomization.removeEntry}\``,
  ].join('\n');

  const { prUrl, prNumber } = await openPullRequest(octokit, cfg, {
    branch,
    title,
    body,
  });

  return {
    mode: 'pr',
    branch,
    prUrl,
    prNumber,
    commitSha: lastCommitSha || undefined,
  };
}
