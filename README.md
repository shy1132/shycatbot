# shycatbot (aka the 9,001st automated image tweeter)
the code for [shycatbot](https://shy.rocks/shycatbot) (**does not include cats!!!**)

## run instructions
(these instructions assume that you have a computer/server with node.js, a folder of images/videos to use, and SOME technical knowledge)

1. download/clone the repository
2. open a terminal in the repo folder and run `npm install` to install dependencies
3. set the config values in `rename-to-config.json` and rename it to `config.json` (refer to the config documentation below)
4. run `node .` to start the bot

## config documentation

### `syncPosts`
`syncPosts` determines whether or not to sync posts between all of the accounts being used (since not all platforms support the same file types)\
`true`: narrow it down to only file types ALL of the platforms support, which limits posting potential\
`false`: post the same thing on every platform, but if a platform doesnt support the chosen file, will choose a new one specifically for that platform

### `priorityList`
`priorityList` is the list of platforms in whatever order you want to login + post to (since it doesnt all happen at the exact same time)\
it is (by default) ordered by the speed of the platforms, but you can change it to whatever you're prioritizing\
it doesn't have to include ALL of the platforms, just the ones that you're using (even then, if you don't include one, it will just push that one to the back)

### etc
for any of the social media keys, set `use` to true to post to that platform

for the `twitter` key, you need to sign up for the twitter api and provide the needed credentials, or set `userAuth` to true and fill in `authToken` (`auth_token` cookie) and `csrfToken` (`ct0` cookie) (may be unreliable and may risk suspension)

for the `bluesky` key, you need to sign up for a bluesky account, provide the handle, and create an app password in settings and provide that to `appPassword` (`refreshIntervalMs` determines when to refresh the credentials, lower if your `postIntervalMs` is less than it)

for the `threads` key, you need to sign up for a threads account, and provide the email and password (important note: this is considered scraping, which violates threads' terms of service, so use this one at your own risk) (less important note: if you restart it a lot, the threads module will get ratelimited and you'll have to wait like 10 minutes before it starts working again)

for the `instagram` key, you need to sign up for an instagram account, and provide the email and password (this has same limitations as threads, but more dangerous since they don't PLAN to make a public instagram api)

for the `tumblr` key, you need to provide the `blog` you want to post to, and create an app and provide credentials (`refreshTokenMs` exists for the same reason as `bluesky`'s does)

for the `mastodon` key, you need to provide the `instance` you want to post to, and an access token from the setting category where you can create an app

for the `firefish` key, you need to provide the `instance` you want to post to, and a token from the `API` category in settings, which needs to have the permissions `View your account information`, `Access your Drive files and folders`, `Edit or delete your Drive files and folders`, and `Compose or delete posts`. it is recommended that you choose an instance with a lot of drive storage

## notice
this is likely not the most stable code ever, but it runs 24/7 on my server quite reliably\
(feel free to host your own media bot with this code!)
