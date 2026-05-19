//psssst this one is risky and probably breaks threads tos
//as soon as a public api comes out, if its good, ill rewrite this to use that instead

//requires
const fs = require('fs').promises
const config = require('../config.json')

//code
if (!config.threads.use) return;
if (config.threads.use && !config.threads.password) return console.log('missing threads password');
if (config.threads.use && !config.threads.email) return console.log('missing threads email');

const scrapingUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0'

let data = {
    appId: '238260118697367',
    csrfToken: '',
    cookie: ''
}

async function init() {
    let sharedData = await (await fetch('https://www.instagram.com/data/shared_data/', {
        headers: {
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Langauge': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': scrapingUserAgent,
            'X-Requested-With': 'XMLHttpRequest'
        }
    })).json()

    data.csrfToken = sharedData.config.csrf_token

    //fun fact: i spent 2 hours trying to figure out how to encrypt a password, then realized if you just pass it a version number of 0, itll let you send an unencrypted password. Why
    let body = `enc_password=${encodeURIComponent(`#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now()/1000)}:${config.threads.password}`)}&optIntoOneTap=false&queryParams=${encodeURIComponent('{}')}&stopDeletionNonce=&textAppStopDeletionToken=&username=${encodeURIComponent(config.threads.email)}`

    let loginRes = await fetch('https://www.threads.net/api/v1/web/accounts/login/ajax/', {
        headers: {
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Langauge': 'en-US,en;q=0.5',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'Dpr': '1',
            'Referer': 'https://www.threads.net/login',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': scrapingUserAgent,
            'Viewport-Width': '1901',
            'X-Asbd-Id': '129477',
            'X-Csrftoken': data.csrfToken,
            'X-Ig-App-Id': data.appId,
            'X-Instagram-Ajax': '0'
        },
        method: 'POST',
        body: body
    })

    let loginData = await loginRes.json()

    if (loginData.user) {
        data.cookie = loginRes.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ')
        data.csrfToken = data.cookie.split('csrftoken=')[1].split(';')[0]
        console.log(`threads: logged in as user id ${loginData.userId} (${config.threads.email})`)

        //setInterval(refreshCsrf, config.threads.refreshIntervalMs)
    } else { //if you do it too many times, itll just say the password was incorrect even though it wasnt (maybe to deter hackers / waste their time?)
        console.log(`threads: failed to log in`)
        return false;
    }
}

//not exactly necessary
/*
async function refreshCsrf() {
    let sharedRes = await fetch('https://www.instagram.com/data/shared_data/', {
        headers: {
            'Accept': '*\/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Langauge': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache',
            'Cookie': data.cookie,
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': scrapingUserAgent,
            'X-Requested-With': 'XMLHttpRequest'
        }
    })

    if (!sharedRes.ok) {
        config.threads.use = false;
        console.log('threads: failed to refresh csrf, disabled threads')
        return false;
    }

    let sharedData = await sharedRes.json()

    if (!sharedData.config.viewer) {
        console.log('threads: failed to refresh csrf, disabled threads')
        return false;
    }

    data.csrfToken = sharedData.config.csrf_token

    return true;
}
*/

async function post(fileName, filePath, mimeType) {
    try {
        let file = await fs.readFile(filePath)
        let timestamp = Date.now()
        let entityName = `fb_uploader_${timestamp}`
        let isImage = mimeType.split('/')[0] == 'image'
        let ruploadParams = isImage ? JSON.stringify({ is_sidecar: '0', is_threads: '1', media_type: '1', upload_id: timestamp.toString() }) : JSON.stringify({ extract_cover_frame: '1', is_sidecar: '0', is_threads: '1', media_type: '2', upload_id: timestamp.toString() })

        let uploadRes = await fetch(`https://www.threads.net/rupload_ig${isImage ? 'photo' : 'video'}/${entityName}`, {
            headers: {
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Langauge': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Content-Length': file.length,
                'Content-Type': mimeType,
                'Cookie': data.cookie,
                'Dpr': '1',
                'Offset': '0',
                'Origin': 'https://www.threads.net',
                'Pragma': 'no-cache',
                'Referer': 'https://www.threads.net/',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'User-Agent': scrapingUserAgent,
                'Viewport-Width': '1920',
                'X-Entity-Length': file.length,
                'X-Entity-Name': entityName,
                'X-Entity-Type': mimeType,
                'X-Ig-App-Id': data.appId,
                'X-Instagram-Rupload-Params': ruploadParams,
            },
            method: 'POST',
            body: file
        })

        if (!uploadRes.ok) {
            let uploadData = await uploadRes.text()
            throw `upload:${uploadData}`;
        }

        let uploadData = await uploadRes.json()
        let uploadId = isImage ? uploadData.upload_id : timestamp.toString()

        let postBody = [
            `caption=${encodeURIComponent(fileName)}`,
            'custom_accessibility_caption=',
            'internal_features=',
            'is_meta_only_post=',
            'is_paid_partnership=',
            'is_threads=true', //text only posts dont have this
            `text_post_app_info=${encodeURIComponent(JSON.stringify({ link_attachment_url: null, reply_control: 0, text_with_entities: { entities: [], text: fileName }}))}`,
            `upload_id=${uploadId}` //text only posts just provide Date.now() for this
        ].join('&')

        let postRes = await fetch('https://www.threads.net/api/v1/media/configure_text_post_app_feed/', { //for text only posts: https://www.threads.net/api/v1/media/configure_text_only_post/
            headers: {
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Langauge': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'Cookie': data.cookie,
                'Dpr': '1',
                'Origin': 'https://www.threads.net',
                'Pragma': 'no-cache',
                'Referer': 'https://www.threads.net/',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'User-Agent': scrapingUserAgent,
                'Viewport-Width': '1920',
                'X-Asbd-Id': '129477',
                'X-Csrftoken': data.csrfToken,
                'X-Ig-App-Id': data.appId,
                'X-Instagram-Ajax': '0'
            },
            method: 'POST',
            body: postBody
        })

        if (!postRes.ok) {
            let postData = await postRes.text()
            throw `post:${postData}`;
        }

        let setCookie = postRes.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ')
        if (setCookie.includes('csrftoken=')) data.csrfToken = setCookie.split('csrftoken=')[1].split(';')[0]

        return true;
    } catch (err) {
        console.log(`threads: failed to post ${fileName}`, err)
        console.error('threads error: ', err)
        return false;
    }
}

module.exports.init = init;
module.exports.post = post;
module.exports.isEnabled = function() {
    return config.threads.use;
}