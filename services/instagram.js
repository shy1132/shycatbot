//psssst this one is risky and probably breaks instagram tos
//a public api LIKELY wont come out for instagram, so this is forever risky

//requires
const fs = require('fs').promises
const config = require('../config.json')

//code
if (!config.instagram.use) return;
if (config.instagram.use && !config.instagram.password) return console.log('missing instagram password');
if (config.instagram.use && !config.instagram.email) return console.log('missing instagram email');

const scrapingUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0'

let data = {
    appId: '936619743392459',
    csrfToken: '',
    rolloutHash: '',
    cookie: ''
}

async function init() {
    let instagramLogin = await (await fetch('https://www.instagram.com/', {
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*\/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Langauge': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'cross-site',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': scrapingUserAgent
        }
    })).text()

    let rolloutHash = instagramLogin.match(/"rollout_hash":"([^"]+)"/)
    if (!rolloutHash) {
        console.log(`instagram: failed to log in`)
        return false;
    }

    rolloutHash = rolloutHash[1]
    data.rolloutHash = rolloutHash

    let csrfToken = instagramLogin.match(/"csrf_token":"([^"]+)"/)
    if (!csrfToken) {
        console.log(`instagram: failed to log in`)
        return false;
    }

    csrfToken = csrfToken[1]
    data.csrfToken = csrfToken

    //instagram and threads are largely the same (thank god)
    //fun fact: i spent 2 hours trying to figure out how to encrypt a password, then realized if you just pass it a version number of 0, itll let you send an unencrypted password. Why
    let body = `enc_password=${encodeURIComponent(`#PWD_INSTAGRAM_BROWSER:0:${Math.floor(Date.now()/1000)}:${config.instagram.password}`)}&optIntoOneTap=false&queryParams=${encodeURIComponent('{}')}&stopDeletionNonce=&textAppStopDeletionToken=&username=${encodeURIComponent(config.instagram.email)}`

    let loginRes = await fetch('https://www.instagram.com/api/v1/web/accounts/login/ajax/', {
        headers: {
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Langauge': 'en-US,en;q=0.5',
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'Dpr': '1',
            'Referer': 'https://www.instagram.com/',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': scrapingUserAgent,
            'Viewport-Width': '1920',
            'X-Asbd-Id': '129477',
            'X-Csrftoken': data.csrfToken,
            'X-Ig-App-Id': data.appId,
            'X-Ig-Www-Claim': '0',
            'X-Instagram-Ajax': rolloutHash,
            'X-Requested-With': 'XMLHttpRequest'
        },
        method: 'POST',
        body: body
    })

    let loginData = await loginRes.json()

    if (loginData.user) {
        data.cookie = loginRes.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ')
        data.csrfToken = data.cookie.split('csrftoken=')[1].split(';')[0]
        console.log(`instagram: logged in as user id ${loginData.userId} (${config.instagram.email})`)
    } else { //if you do it too many times, itll just say the password was incorrect even though it wasnt (maybe to deter hackers / waste their time?)
        console.log(`instagram: failed to log in`)
        return false;
    }
}

async function post(fileName, filePath, mimeType) {
    try {
        let file = await fs.readFile(filePath)
        let timestamp = Date.now()
        let entityName = `fb_uploader_${timestamp}`
        let isImage = mimeType.split('/')[0] == 'image'
        let ruploadParams = isImage ? JSON.stringify({ media_type: '1', upload_id: timestamp.toString() }) : JSON.stringify({ extract_cover_frame: '1', media_type: '2', upload_id: timestamp.toString() })

        let uploadRes = await fetch(`https://i.instagram.com/rupload_ig${isImage ? 'photo' : 'video'}/${entityName}`, {
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
                'Origin': 'https://www.instagram.com',
                'Pragma': 'no-cache',
                'Referer': 'https://www.instagram.com/',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'User-Agent': scrapingUserAgent,
                'Viewport-Width': '1920',
                'X-Entity-Length': file.length,
                'X-Entity-Name': entityName,
                'X-Entity-Type': mimeType,
                'X-Ig-App-Id': data.appId,
                'X-Instagram-Ajax': data.rolloutHash,
                'X-Instagram-Rupload-Params': ruploadParams
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

        //very stupid way of doing it but i couldnt find another way to get the www claim
        let instagramHome = await (await fetch('https://www.instagram.com/', {
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*\/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Langauge': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'cross-site',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': scrapingUserAgent
            }
        })).text()
    
        let wwwClaim = instagramHome.match(/,"claim":"([^"]+)"/) //parse www claim out of json in script
        if (!wwwClaim) throw 'claim:failed_to_parse_www_claim_from_instagram_home';

        wwwClaim = wwwClaim[1]

        let postBody = [
            'archive_only=false',
            `caption=${encodeURIComponent(fileName)}`,
            'clips_share_preview_to_feed=1',
            'disable_comments=0',
            'disable_oa_reuse=false',
            'igtv_share_preview_to_feed=1',
            'is_meta_only_post=0',
            'is_unified_video=1', //even if its a photo
            'like_and_view_counts_disabled=0',
            'source_type=library',
            `upload_id=${uploadId}`,
            'video_subtitles_enabled=0'
        ].join('&')

        let postRes = await fetch('https://www.instagram.com/api/v1/media/configure/', {
            headers: {
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Langauge': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'Cookie': data.cookie,
                'Dpr': '1',
                'Origin': 'https://www.instagram.com',
                'Pragma': 'no-cache',
                'Referer': 'https://www.instagram.com/',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'User-Agent': scrapingUserAgent,
                'Viewport-Width': '1920',
                'X-Asbd-Id': '129477',
                'X-Csrftoken': data.csrfToken,
                'X-Ig-App-Id': data.appId,
                'X-Ig-Www-Claim': wwwClaim,
                'X-Instagram-Ajax': data.rolloutHash,
                'X-Requested-With': 'XMLHttpRequest'
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
        console.log(`instagram: failed to post ${fileName}`, err)
        console.error('instagram error: ', err)
        return false;
    }
}

module.exports.init = init;
module.exports.post = post;
module.exports.isEnabled = function() {
    return config.instagram.use;
}