# Google Sheets content calendar for sprkly
This copy uses built-in n8n nodes only, for n8n Cloud. The main template in `../sheets-content-calendar/` uses the sprkly node.
- Every 15 minutes it checks rows with Status Approved and schedules the good ones in sprkly.
- Each row gets Scheduled and the post ID, or Error and a reason. A re-run never posts twice.
- Every 5 minutes it writes Published and the link, or Failed and the reason, back to the row. A row with several accounts shows Failed if any account failed.

1. In n8n, import `workflow.json`.
2. In **Get sprkly accounts once**, make a Bearer Auth credential with your sprkly API key (sprkly: Settings, then API Keys). Pick it in the other 2 sprkly nodes.
3. Add your Google Sheets login to the 3 sheet nodes.
4. Import `sheet-template.csv` into Google Sheets. Format the Schedule Time column as plain text.
5. Pick your sheet and tab in the 3 sheet nodes.
6. Set your time zone in Workflow settings. Schedule Time uses it.
7. Turn the workflow on. Status updates start from then.

A row with no Schedule Time is never sent: in the sprkly API (https://sprkly.app/docs/api) an empty time posts right away.
