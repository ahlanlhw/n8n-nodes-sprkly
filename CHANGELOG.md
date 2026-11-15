# Changelog

## 0.2.0

- Post, Create: **Accounts By Name** (`instagram:myhandle`), read with one accounts call per run.
- Post, Create: **Post Now**. From node version 1.1 an empty Schedule Time is refused unless it is on. Version 1 nodes post at once as before.
- Post, Create: **Output** = **Result Row**. One flat row per item, never an error for one item.
- Post, Create: Media URLs split on commas, spaces or new lines. Impossible dates like 2026-02-30 and dates like 01/12/2026 are refused.
- Post, Create: **Require External ID**. Refuses an item whose External ID is empty or ends with `-`, `_` or `:`.
- Post, Create, Result Row: a duplicate External ID is `ok` only when the caption and time match the first post. Another row with the same ID, or a deleted first post, gives `Error` and the first post's ID.
- Trigger: `sourceId`, `statusLabel`, `link` and `error` on each post. **External ID Starts With** filter.
- Trigger: with **Remove It From Source ID** on, a post left with an empty `sourceId` is skipped.
- Fix: in 0.1.0 an empty Schedule Time posted at once. From node version 1.1 it is refused unless **Post Now** is on.

## 0.1.0

- First release: Account, Media and Post operations, and the sprkly Trigger.
