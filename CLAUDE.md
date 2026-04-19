# joo-on-claude — Project Instructions

Development conventions specific to this plugin repository.

## Third-Party Code Attribution

This plugin borrows from other open-source projects (MIT-licensed). When
porting code, follow this workflow to keep license compliance tidy.

### Decision rule — do I need to attribute?

- **Verbatim or near-verbatim copy** → yes, attribute
- **Read, understood, rewrote from scratch** → no legal obligation (courtesy mention in the commit message is nice but optional)

The line is whether a reader would recognize the copied version as the
same file. Line-by-line copy with renamed variables = still verbatim.
Same idea expressed in your own structure = original.

### When attribution is required

Do all three:

1. **Inline HTML comment** at the top of each ported file (after frontmatter):
   ```html
   <!--
     Based on <upstream-project> (<LICENSE>, © <Author>)
     Source: <URL-to-upstream-file>

     Changes from upstream:
       1. <change one>
       2. <change two>
   -->
   ```
   If the port is verbatim, say "Preserved verbatim — no changes" instead.

2. **Append a row to `NOTICES.md`** under the correct upstream section.
   If the upstream is new, add a new section with its copyright + license
   text. If the upstream already has a section, just add the file to the
   derived-files table.

3. **Commit message** — cite the upstream explicitly:
   ```
   feat: add <skill-name> skill (port from <upstream>)
   ```

### License compatibility

- **MIT / BSD / Apache 2.0 source → MIT plugin** — OK. MIT/BSD are simplest
  (just attribute). Apache 2.0 additionally requires propagating the
  upstream `NOTICE` file and recording significant changes.
- **GPL / AGPL source → MIT plugin** — **do not port**. GPL is viral and
  would force this plugin to become GPL.
- **Unlicensed source** — treat as "all rights reserved". Do not copy.

## Versioning

- Bump `.claude-plugin/plugin.json` version on every user-visible change
- Use semver: `MAJOR.MINOR.PATCH`
  - Major: breaking changes (rare for a personal plugin)
  - Minor: new skills, hooks, or features
  - Patch: bug fixes, internal refactors, doc-only changes

## Commit discipline

- One logical change per commit
- Commit message first line ≤ 72 chars
- When a commit ports third-party code, its message must cite the upstream
- `git push --force-with-lease` is fine; `--force` is blocked by the hook
  (intentionally — use `--force-with-lease` for safety)
