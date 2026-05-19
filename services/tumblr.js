//requires
const fs = require('fs').promises
const crypto = require('crypto')
const FormData = require('form-data')
const config = require('../config.json')

//code
if (!config.tumblr.use) return;
if (config.tumblr.use && !config.tumblr.blog) return console.log('missing tumblr blog');
if (config.tumblr.use && !config.tumblr.consumerKey) return console.log('missing tumblr consumer key');

let consumerKey = config.tumblr.consumerKey
let consumerSecret = config.tumblr.consumerSecret
let accessToken;
let blog = config.tumblr.blog

async function init() {
    let tokenData = await (await fetch('https://api.tumblr.com/v2/oauth2/token', {
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': config.userAgent
        },
        body: JSON.stringify({ grant_type: 'client_credentials', client_id: consumerKey, client_secret: consumerSecret }),
        method: 'POST'
    })).json()

    if (!tokenData.access_token) {
        console.log('tumblr: failed to log in')
        return false;
    }

    accessToken = `Bearer ${tokenData.access_token}`;

    let data = await (await fetch('https://api.tumblr.com/v2/user/info', {
        headers: {
            'Authorization': accessToken,
            'User-Agent': config.userAgent
        }
    })).json()

    if (data.meta && data.meta.status == 200) {
        console.log(`tumblr: logged in as ${data.response.user.name}, posting to ${blog}`)
        setInterval(refreshToken, config.tumblr.refreshIntervalMs) //refresh token every x amount of time (30 minutes by default)
        return true;
    } else {
        console.log('tumblr: failed to log in')
        return false;
    }
}

async function checkToken() {
    let check = await (await fetch('https://api.tumblr.com/v2/user/info', {
        headers: {
            'Authorization': accessToken,
            'User-Agent': config.userAgent
        }
    })).json()

    if (check.meta && check.meta.status == 200) return true;

    return false;
}

async function refreshToken() {
    let newToken = await (await fetch('https://api.tumblr.com/v2/oauth2/token', {
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': config.userAgent
        },
        body: JSON.stringify({ grant_type: 'client_credentials', client_id: consumerKey, client_secret: consumerSecret }),
        method: 'POST'
    })).json()

    if (newToken.access_token) {
        accessToken = `Bearer ${newToken.access_token}`
        return true;
    } else {
        config.tumblr.use = false;
        console.log('tumblr: failed to refresh token, disabled tumblr')
        return false;
    }
}

async function post(fileName, filePath, mimeType) {
    try {
        let tokenValid = await checkToken()
        if (!tokenValid) await refreshToken()

        let file = await fs.readFile(filePath)
        let postType = mimeType.split('/')[0]

        let postJson = {
            content: [
                {
                    type: postType, //"image", "video", "audio"
                    media: { type: mimeType, identifier: 'media' }
                },
                {
                    type: 'text',
                    text: fileName
                }
            ]
        }

        //construct the multipart form data
        let form = new FormData()

        let boundary = `shycatbotFormBoundary${crypto.randomBytes(8).toString('hex')}`
        form.setBoundary(boundary)

        form.append('json', JSON.stringify(postJson)) //hate that tumblr does this, i originally spent a good like 2 hours trying to figure this out because their api docs are SO FUCKING VAGUE
        form.append('media', file, {
            filename: fileName,
            contentType: mimeType
        })

        //create the post, with the form data
        let data = await (await fetch(`https://api.tumblr.com/v2/blog/${blog}/posts`, {
            headers: {
                'Authorization': accessToken,
                'User-Agent': config.userAgent,
                ...form.getHeaders()
            },
            method: 'POST',
            body: form.getBuffer()
        })).json()

        if (!data.meta || data.meta.status !== 201) throw `post:${JSON.stringify(data)}`;

        return true;
    } catch (err) {
        console.log(`tumblr: failed to post ${fileName}`, err)
        console.error('tumblr error: ', err)
        return false;
    }
}

module.exports.init = init;
module.exports.post = post;
module.exports.isEnabled = function() {
    return config.tumblr.use;
}