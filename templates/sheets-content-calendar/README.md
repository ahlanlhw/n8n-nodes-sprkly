# Google Sheets content calendar for sprkly

- Every 15 minutes, rows with Status `Approved` become scheduled posts in sprkly.
- Each row gets back its Status, sprkly Post ID, time, link and error.
- A re-run never posts twice, and a bad row never stops the others.

1. In n8n, import `workflow.json`.
2. On self-hosted n8n, install the node `n8n-nodes-sprkly` 0.2.0 or later: https://github.com/ahlanlhw/n8n-nodes-sprkly
3. Add your sprkly API key to the 3 sprkly nodes. API docs: https://sprkly.app/docs/api
4. Add your Google login to the 3 Google Sheets nodes.
5. Import `sheet-template.csv` into Google Sheets, with Schedule Time as plain text. Give every row its own Row ID. Pick that sheet in each Google Sheets node.
6. Set the time zone in Workflow settings, then turn the workflow on.

An empty Schedule Time is refused, so nothing posts by accident.
Tested live on n8n 2.47.7 with the earlier Code node build (node 0.1.0). v0.2 not yet run live. Offline check: `node templates/sheets-content-calendar/test/workflow.test.js`.
