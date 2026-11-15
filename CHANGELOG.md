# Changelog

## 0.2.0

- Post, Create: **Accounts By Name** (`instagram:myhandle`), read with one accounts call per run.
- Post, Create: **Post Now**. From node version 1.1 an empty Schedule Time is refused unless it is on. Version 1 nodes post at once as before.
- Post, Create: **Output** = **Result Row**. One flat row per item, never an error for one item.
- Post, Create: Media URLs split on commas, spaces or new lines. Impossible dates like 2026-02-30 and dates like 01/12/2026 are refused.
- Trigger: `sourceId`, `statusLabel`, `link` and `error` on each post. **External ID Starts With** filter.

## 0.1.0

- First release: Account, Media and Post operations, and the sprkly Trigger.
