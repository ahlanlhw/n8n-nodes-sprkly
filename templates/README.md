# Templates

Ready-made n8n workflows that post with sprkly. Install the community node `n8n-nodes-sprkly` (Settings, Community Nodes), then import a file with Import from File. Each file has a note with its setup. Not part of the npm package.

| File | What it does | Logins |
|---|---|---|
| `google-sheets-to-sprkly.json` | Approved sheet rows become scheduled posts. Status comes back to the row. | sprkly, Google |
| `google-sheets-to-sprkly-http.json` | The same sheet calendar with built-in nodes only, for n8n Cloud. | sprkly key, Google |
| `airtable-to-sprkly.json` | Ready records become posts that wait for your OK in sprkly. | sprkly, Airtable |
| `notion-to-sprkly.json` | Ready pages are booked only if the accounts are free within 2 hours. | sprkly, Notion |
| `csv-to-sprkly.json` | Upload a CSV or Excel file, get a results file back. | sprkly |
| `google-drive-to-sprkly.json` | A new file in a Drive folder becomes a post. | sprkly, Google |
| `rss-to-sprkly.json` | New blog posts from a feed become posts, logged in a sheet. | sprkly, Google |
| `shopify-to-sprkly.json` | A new Shopify product becomes a post. | sprkly, Shopify |
| `telegram-to-sprkly.json` | Send a bot a photo and caption to schedule a post. | sprkly, Telegram |
| `youtube-to-sprkly.json` | A new YouTube video becomes a post, with a Telegram note. | sprkly, Telegram |
| `ai-captions-to-sprkly.json` | AI writes captions for sheet rows. Posts wait for your OK. | sprkly, Google, OpenAI |
| `ai-carousel-to-sprkly.json` | A form brief becomes an AI image carousel that waits for your OK. | sprkly, OpenAI, image API |
| `ai-video-to-sprkly.json` | A prompt becomes an AI video for Reels, TikTok and Shorts, held for your OK. | sprkly, Google, video API |
| `blog-summary-to-sprkly.json` | AI sums up each new blog post. Posts wait for your OK. | sprkly, OpenAI, Telegram |
| `all-actions-demo.json` | Runs every action once: a guided tour of the node. Used in the n8n review video. | sprkly |
