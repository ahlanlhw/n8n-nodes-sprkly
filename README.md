# n8n-nodes-sprkly

This is an n8n community node for [sprkly](https://sprkly.app/?utm_source=github&utm_medium=integration&utm_campaign=n8n-node).

sprkly schedules posts to Instagram, TikTok, YouTube Shorts, Threads, Facebook, Bluesky, X, LinkedIn and Telegram.

With this node you can:

- Schedule a post, or send it out within about a minute.
- Upload images and videos to sprkly.
- Read, change and delete posts that have not gone out.
- Start a workflow when a post goes out or fails.

[n8n](https://n8n.io/) is a workflow automation tool.

## Contents

- [Install](#install)
- [Credentials](#credentials)
- [Operations](#operations)
- [Trigger](#trigger)
- [Example flows](#example-flows)
- [Limits](#limits)
- [Compatibility](#compatibility)
- [Resources](#resources)
- [Version history](#version-history)

## Install

- Follow the [community nodes install guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n docs.
- In n8n, go to **Settings**, then **Community Nodes**, then **Install**.
- Enter `n8n-nodes-sprkly`.
- Community nodes that n8n has not verified work on self-hosted n8n only.

## Credentials

You need a sprkly API key.

1. Sign in to sprkly.
2. Go to **Settings**, then **API Keys**.
3. Make a new key. Copy it. It starts with `sk_live_`.
4. In n8n, add a new **Sprkly API** credential.
5. Paste the key into **API Key**.
6. Leave **Base URL** as it is.

n8n checks the key when you save the credential.

## Operations

### Account

- **Get Current Key**: the plan, scopes and accounts of the key in use.
- **Get Many**: the social accounts connected to sprkly, with their IDs.

### Media

- **Upload**: send a file from an earlier node, such as Google Drive. Gives back a media ID.
- **Add From URL**: sprkly downloads a public link and keeps the file. Gives back a media ID. Google Drive and Dropbox share links work.

### Post

- **Create**: schedule a post. Leave **Schedule Time** empty to send it out within about a minute.
- **Get**: one post with its status, its link, and the reason if it failed.
- **Get Many**: list posts. Filter by status, or by the time of the last change.
- **Update**: change the caption, time, accounts, media, alt text or post type of a post that has not gone out.
- **Delete**: move a post that has not gone out to the Bin. You can bring it back in sprkly for 30 days.

### Create fields

- **Account Names or IDs**: where to post. sprkly makes one post per account.
- **Caption**: the text of the post.
- **Schedule Time**: when to post. A time without a time zone uses the time zone of the workflow.
- **Media IDs**: from Upload or Add From URL. Put several in slide order, with commas.
- **Additional Fields**:
  - **Title**: TikTok and YouTube need one.
  - **Media URLs**: public links, if you did not upload first.
  - **Post Type**: what the post is for, for your own reports.
  - **External ID**: your own ID for the post. See the tip below.
  - **Requires Approval**: hold the post until the owner approves it by email.
  - **Approval Note**: a note in that email.
  - **First Comment**: Instagram only. Posted under the post once it goes out.
  - **Alt Text**: one line per image, in media order.
  - **TikTok Privacy Level**: who can see it on TikTok. TikTok needs this.
  - **Platform Options (JSON)**: more settings per platform. See the [API docs](https://sprkly.app/docs/api).

Tip: set **External ID** to a stable ID from your source, like a sheet row number. If the workflow runs twice, sprkly refuses the second post and names the first one. Nothing posts twice.

## Trigger

The **sprkly Trigger** node checks sprkly on a schedule you set.

- **Post Published**: a post went out. You get the post with its link.
- **Post Failed**: a post could not go out. You get the post with the reason.

Notes:

- When you turn the workflow on, it starts from that moment. Older posts do not fire.
- Each post fires once per event.
- In a test run it shows the newest matching post, so you can map its fields.

## Example flows

### Google Sheets row to post

1. **Google Sheets Trigger**: a row is added.
2. **sprkly**, Media, **Add From URL**: the row's image link.
3. **sprkly**, Post, **Create**:
   - Accounts: pick them from the list.
   - Caption: the row's caption.
   - Schedule Time: the row's date.
   - Media IDs: `{{ $json.mediaId }}` from step 2.
   - External ID: the row number.
4. **Google Sheets**: write the post IDs back to the row.

### New Google Drive file to post

1. **Google Drive Trigger**: a file is added to a folder.
2. **Google Drive**, **Download**: the file.
3. **sprkly**, Media, **Upload**: Input Binary Field `data`.
4. **sprkly**, Post, **Create**:
   - Media IDs: `{{ $json.mediaId }}` from step 3.
   - External ID: the Drive file ID.

Add a **sprkly Trigger** on **Post Failed** in another workflow to get a message when a post does not go out.

## Limits

- Files up to 50 MB each.
- 20 requests a minute on the Free plan. 60 on paid plans. Each plan also has a monthly limit.
- When you hit a limit, the node says how long to wait.
- A failed post is never sent again. Schedule a new post instead.
- Get Many gives at most 500 posts in one call. With **Updated After** set and **Return All** on, it pages through more.

## Compatibility

- Built with the n8n node CLI, n8n nodes API version 1.
- Needs an n8n version that supports community nodes.

## Resources

- [sprkly API docs](https://sprkly.app/docs/api)
- [n8n community nodes docs](https://docs.n8n.io/integrations/#community-nodes)
- [sprkly](https://sprkly.app/?utm_source=github&utm_medium=integration&utm_campaign=n8n-node)

## Version history

- 0.1.0: first release. Account, Media and Post operations, and the sprkly Trigger.

## License

[MIT](LICENSE)
