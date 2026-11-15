# Google Sheets content calendar for sprkly

Plan posts in a Google Sheet. Mark a row Approved. This n8n workflow schedules it in sprkly and writes the result back to the row.

## What it does

- Every 15 minutes it reads the rows with Status `Approved`.
- It checks each row before anything is sent:
  - Row ID is there.
  - Caption is there.
  - Schedule Time is a real time that has not come yet.
  - At least one account.
  - Media URL, if there is one, is a web link.
- A row that fails gets Status `Error` and a plain reason in the Error column.
- It gets your sprkly accounts once per run, not once per row.
- Each good row becomes a scheduled post in sprkly.
- The row gets Status `Scheduled`, the sprkly Post ID and the time.
- When the post goes out, the row gets `Published` and the link.
- When the post fails, the row gets `Failed` and the reason.

## It never posts twice

- Each post gets the External ID `sheet-<Row ID>`.
- sprkly refuses a second post with the same External ID.
- When that happens, the row gets the first post's ID. Nothing new is posted.

## It never posts right away

- In the sprkly API, a post with no time goes out at once.
- This workflow refuses that. A row with no Schedule Time gets Status `Error` and never reaches sprkly.

## What you need

- Self-hosted n8n. Tested on n8n 2.47.7.
- The community node `n8n-nodes-sprkly`, version 0.1.0 or later.
  - n8n has not verified this node yet, so it does not run on n8n Cloud.
  - Install steps: https://github.com/ahlanlhw/n8n-nodes-sprkly#install
- A sprkly API key. In sprkly go to Settings, then API Keys.
- A Google account with Google Sheets.

## Setup

1. Make the sheet.
   - In Google Sheets, open File, then Import, and upload `sheet-template.csv`.
   - Or make the columns yourself, with these exact names in row 1.
2. Format the Schedule Time column as plain text.
   - Select the column. Open Format, then Number, then Plain text.
   - This keeps your times as you typed them.
3. In n8n, import `workflow.json` (Workflows, then Import from File).
4. Add your sprkly API credential to these 4 nodes:
   - Get sprkly accounts once
   - Schedule post in sprkly
   - When a post goes out
   - When a post fails
5. Add your Google Sheets credential to these 3 nodes, and pick your sheet and tab in each:
   - Get approved rows
   - Write result to row
   - Write post status to row
6. Set your time zone. Open the workflow menu, then Settings, then Timezone.
7. Test with one row first. See "Test it safely" below.
8. Turn the workflow on.

## Sheet columns

| Column | Who fills it | What goes in it |
|---|---|---|
| Row ID | You | A number or name, different on every row. Never change it after a row is scheduled. |
| Status | You, then the workflow | You set `Draft` or `Approved`. The workflow sets the rest. |
| Caption | You | The text of the post. |
| Schedule Time | You | Like `2026-12-01 09:00`, in the workflow's time zone. |
| Accounts | You | Like `instagram:myhandle`. Put commas between several. |
| Media URL | You | A public link to an image or video. Optional. Put commas between several for a carousel. |
| sprkly Post ID | The workflow | The post's ID in sprkly. |
| Scheduled For | The workflow | The time sprkly will post, in UTC. |
| Link | The workflow | The link to the live post. |
| Error | The workflow | Why a row did not go out. |

## Statuses

- `Draft`: you are still working on it. The workflow skips it.
- `Approved`: ready. The workflow picks it up on its next run.
- `Scheduled`: sprkly has it and will post it.
- `Published`: it went out. The Link column has the link.
- `Failed`: sprkly tried and could not post it. The Error column says why. sprkly never sends a failed post again.
- `Error`: the row never reached sprkly, or sprkly said no. Fix the row and set it to `Approved` again.

## Accounts

- Write each account as `platform:handle`.
- Use the handle sprkly shows for that account.
- Examples: `instagram:myhandle`, `telegram:My channel`.
- Case and a leading `@` do not matter.
- To find the names, open the node **Get sprkly accounts once** and run it. It lists every connected account with its platform and handle.

## Times

- Write times like `2026-12-01 09:00`. Seconds are fine too.
- The workflow reads them in its own time zone (step 6 of Setup).
- A time with a zone, like `2026-12-01T09:00:00+08:00`, keeps that zone.
- Day-first or month-first dates, like `01/12/2026`, are refused. They are too easy to misread.

## Good to know

- A row with several accounts makes one post per account. The sprkly Post ID column lists them all.
  - Link and Status show the last post that went out or failed.
  - One account per row gives the clearest status.
- The two sprkly triggers check every 5 minutes. They only see posts that change after you turn the workflow on.
- Changing a row after it is scheduled does not change the post. Change or delete it in sprkly.
- Two rows with the same Row ID: the second one is not posted. It gets the first row's Post ID. Keep Row IDs different.
- TikTok and YouTube need a title. Add a Title column and map it in **Schedule post in sprkly**, under Additional Fields.
- Instagram and TikTok need an image or a video.

## Test it safely

- This workflow posts for real.
- Use a test account you own, like a private Telegram channel.
- Set one row's time days ahead. Check it shows as scheduled in sprkly. Then delete it in sprkly.

## Files

- `workflow.json`: the n8n workflow. Import this.
- `sheet-template.csv`: the columns and 3 example rows.
- `test/code-nodes.test.js`: checks the Code nodes with sample rows. Run `node test/code-nodes.test.js` from this folder. It needs no install and calls nothing.

## Links

- sprkly API docs: https://sprkly.app/docs/api
- The node on GitHub: https://github.com/ahlanlhw/n8n-nodes-sprkly
