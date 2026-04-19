# Third-Party Notices

This plugin contains code derived from the following third-party projects.
Each section reproduces the original project's copyright and license notice,
as required by their respective licenses.

---

## toby-plugins

**Source:** https://github.com/tobyilee/toby-plugins
**License:** MIT

### Copyright

```
MIT License

Copyright (c) Toby Lee

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Derived files

| File | Relationship to upstream |
|------|--------------------------|
| `skills/code-quality/SKILL.md` | Near-verbatim port; frontmatter adjusted, HTML attribution block added |
| `skills/code-explore/SKILL.md` | Near-verbatim port; frontmatter adjusted, HTML attribution block added |
| `skills/merge-permissions/SKILL.md` | Hardened port (significantly rewritten); 5 safety invariants, dry-run default, deny-union-only guarantee added |
| `skills/save-conversation/SKILL.md` | Restructured port; English-only template, elapsed-time tracking added, monthly prompt log removed |
| `skills/tdd-team/SKILL.md` | Near-verbatim port; frontmatter adjusted, body preserved |
| `skills/tdd-team/references/agent-prompts.md` | Verbatim copy |

Each derived file also carries an inline HTML comment citing this upstream.
