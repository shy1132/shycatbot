//requires
const fs = require('fs').promises
const config = require('../config.json')

//code
if (!config.bluesky.use) return;
if (config.bluesky.use && !config.bluesky.appPassword) return console.log('missing bluesky app password');
if (config.bluesky.use && !config.bluesky.handle) return console.log('missing bluesky handle');
if (config.bluesky.handle.startsWith('@')) config.bluesky.handle = config.bluesky.handle.substr(1);

let session = {
    accessJwt: null,
    refreshJwt: null,
    handle: null
}

async function init() {
    let data = await (await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': config.userAgent
        },
        method: 'POST',
        body: JSON.stringify({ identifier: config.bluesky.handle, password: config.bluesky.appPassword })
    })).json()

    if (data.accessJwt) {
        session.accessJwt = data.accessJwt;
        session.refreshJwt = data.refreshJwt;
        session.handle = data.handle;
        console.log(`bluesky: logged in as ${session.handle}`)

        setInterval(refreshSession, config.bluesky.refreshIntervalMs) //refresh session every x amount of time (30 minutes by default)

        return true;
    } else {
        console.log(`bluesky: failed to log in`)
        return false;
    }
}

async function checkSession() {
    let check = await fetch('https://bsky.social/xrpc/com.atproto.server.getSession', {
        headers: {
            'Authorization': `Bearer ${session.accessJwt}`,
            'Content-Type': 'application/json',
            'User-Agent': config.userAgent
        }
    })

    if (check.ok) return true; //itll return a 200 when successful

    return false;
}

async function refreshSession() {
    //console.log('bluesky: refreshing session')

    let refresh = await (await fetch('https://bsky.social/xrpc/com.atproto.server.refreshSession', {
        headers: {
            'Authorization': `Bearer ${session.refreshJwt}`,
            'Content-Type': 'application/json',
            'User-Agent': config.userAgent
        },
        method: 'POST'
    })).json()

    if (refresh.accessJwt) {
        session.accessJwt = refresh.accessJwt;
        session.refreshJwt = refresh.refreshJwt;
        session.handle = refresh.handle;
        //console.log('bluesky: session refreshed')
        return true;
    } else {
        config.bluesky.use = false;
        console.log('bluesky: failed to refresh session, disabled bluesky')
        return false;
    }
}

async function post(fileName, filePath, mimeType) {
    try {
        let sessionValid = await checkSession()
        if (!sessionValid) await refreshSession()

        let file = await fs.readFile(filePath)

        let postBody;

        if (mimeType.startsWith('image/')) {
            //upload the file (they dont use multipart form data for some reason, but i dont mind i hate that shit)
            let upload = await (await fetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
                headers: {
                    'Authorization': `Bearer ${session.accessJwt}`,
                    'Content-Type': mimeType,
                    'User-Agent': config.userAgent
                },
                method: 'POST',
                body: file
            })).json()

            if (!upload.blob) throw `upload:${JSON.stringify(upload)}`;

            //create the post with the image
            postBody = JSON.stringify({
                collection: 'app.bsky.feed.post',
                repo: config.bluesky.handle,
                record: {
                    $type: 'app.bsky.feed.post',
                    createdAt: new Date().toISOString(),
                    text: fileName,
                    embed: {
                        $type: 'app.bsky.embed.images',
                        images: [
                            { alt: '', image: upload.blob }
                        ]
                    }
                }
            })

            let post = await (await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
                headers: {
                    'Authorization': `Bearer ${session.accessJwt}`,
                    'Content-Type': 'application/json',
                    'User-Agent': config.userAgent
                },
                body: postBody,
                method: 'POST'
            })).json()

            if (!post.uri) throw `post:${JSON.stringify(post)}`;
        } else if (mimeType.startsWith('video/')) {
            //i would fetch limits first, but theyre Pretty high (10 gigabytes...) so like... not concerned, dont wanna have to write extra code to rechoose file and stuff

            let serviceAuth = await (await fetch(`https://woodear.us-west.host.bsky.network/xrpc/com.atproto.server.getServiceAuth?aud=${encodeURIComponent('did:web:woodear.us-west.host.bsky.network')}&lxm=com.atproto.repo.uploadBlob&exp=${Math.floor((Date.now() + 1800000) / 1000)}`, {
                headers: {
                    'Authorization': `Bearer ${session.accessJwt}`,
                    'User-Agent': config.userAgent
                }
            })).json()

            if (!serviceAuth.token) throw `serviceAuth:${JSON.stringify(serviceAuth)}`

            //upload the file (they dont use multipart form data here either, thank you bluesky devs)
            let upload = await (await fetch(`https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?name=${encodeURIComponent(fileName)}`, {
                headers: {
                    'Authorization': `Bearer ${serviceAuth.token}`,
                    'Content-Type': mimeType,
                    'User-Agent': config.userAgent
                },
                method: 'POST',
                body: file
            })).json()

            if (!upload.jobId || (upload.state !== 'JOB_STATE_CREATED' && upload.state !== 'JOB_STATE_COMPLETED')) throw `upload:${JSON.stringify(upload)}`;

            let jobId = upload.jobId;

            async function waitForUploadBlob() { //recursively check the progress every second and wait until its done processing
                //nesting hell
                try {
                    return await new Promise(async (resolve, reject) => {
                        async function check() {
                            let data = await (await fetch(`https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${jobId}`, {
                                headers: {
                                    'Authorization': `Bearer ${session.accessJwt}`,
                                    'User-Agent': config.userAgent
                                }
                            })).json()

                            if (!data.jobStatus || data.jobStatus.state == 'JOB_STATE_FAILED') {
                                reject(`uploadProgress:${JSON.stringify(data)}`)
                            } else if (data.jobStatus.state == 'JOB_STATE_COMPLETED') {
                                resolve(data.jobStatus.blob)
                            } else {
                                setTimeout(async () => await check(), 1000)
                            }
                        }

                        await check()
                    })
                } catch (err) {
                    throw err;
                }
            }

            let blob = await waitForUploadBlob()

            //create the post with the video
            postBody = JSON.stringify({
                collection: 'app.bsky.feed.post',
                repo: config.bluesky.handle,
                record: {
                    $type: 'app.bsky.feed.post',
                    createdAt: new Date().toISOString(),
                    text: fileName,
                    embed: {
                        $type: 'app.bsky.embed.video',
                        video: blob
                    }
                }
            })
        }

        let post = await (await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
            headers: {
                'Authorization': `Bearer ${session.accessJwt}`,
                'Content-Type': 'application/json',
                'User-Agent': config.userAgent
            },
            body: postBody,
            method: 'POST'
        })).json()

        if (!post.uri) throw `post:${JSON.stringify(post)}`;

        return true;
    } catch (err) {
        console.log(`bluesky: failed to post ${fileName}`, err)
        console.error('bluesky error: ', err)
        return false;
    }
}

module.exports.init = init;
module.exports.post = post;
module.exports.isEnabled = function() {
    return config.bluesky.use;
}