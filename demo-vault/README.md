# Demo vault

A small fictional Obsidian vault used by `bun run demo`, `docker compose up` and the tests.
Everything here is invented. `{{day}}`, `{{day+2}}`, `{{day-1}}` are replaced with real dates
(relative to today) when the vault is copied, so the agenda and the brief always look current.

| Folder | Records (frontmatter `type`) |
| --- | --- |
| `20-tasks/` | `task` (one note per task) |
| `20-tasks/calendar/` | `event` (one note per calendar event) |
| `30-projects/` | `project` (metadata, milestones) |
| `40-connaissances/médias/<category>/` | `media` |
| `40-connaissances/idées/` | `kanban-idées.md` (Obsidian Kanban plugin) + `idée` notes |
| `00-inbox/briefs/` | `brief` (generated morning briefs) |
