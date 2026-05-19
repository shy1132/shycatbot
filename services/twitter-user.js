//requires
const fs = require('fs').promises;
const crypto = require('crypto')
const FormData = require('form-data')
const { ClientTransaction, handleXMigration } = require('x-client-transaction-id')
const config = require('../config.json')

//code
if (!config.twitter.use) return;
if (config.twitter.use && (!config.twitter.csrfToken || !config.twitter.authToken)) return console.log('missing twitter authToken and csrfToken');

const baseHeaders = {
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    'Cache-Control': 'no-cache',
    'Cookie': `auth_token=${config.twitter.authToken}; ct0=${config.twitter.csrfToken}`,
    'Origin': 'https://x.com',
    'Pragma': 'no-cache',
    'Referer': 'https://x.com/home',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    'X-Csrf-Token': config.twitter.csrfToken,
    'X-Twitter-Active-User': 'yes',
    'X-Twitter-Auth-Type': 'OAuth2Session',
    'X-Twitter-Client-Language': 'en'
}

let solver;

async function init() {
    try {
        let document = await handleXMigration()
        solver = new ClientTransaction(document)
        await solver.initialize()
    } catch (err) {
        console.log('twitter: failed to initialize x-client-transaction-id solver')
        return false;
    }

    let res = await fetch('https://api.x.com/1.1/account/verify_credentials.json', {
        headers: {
            ...baseHeaders,
            'x-client-transaction-id': await solver.generateTransactionId('GET', '/1.1/account/verify_credentials.json')
        }
    })

    let data = await res.text()

    if (data.startsWith('{') && res.ok) {
        let json = JSON.parse(data)
        auth = json;

        console.log(`twitter: logged in as @${json.screen_name}`)

        return true;
    } else {
        console.log('twitter: auth is invalid')
        return false;
    }
}

async function post(fileName, filePath, mimeType) {
    try {
        let stat = await fs.stat(filePath)
        let file = await fs.readFile(filePath)

        let mediaId;

        if (mimeType.startsWith('image/') && mimeType !== 'image/gif') {
            let form = new FormData()
            form.setBoundary(generateWebKitBoundary())
            form.append('media', file, {
                filename: fileName,
                contentType: mimeType
            })

            let uploadRes = await fetch('https://upload.x.com/1.1/media/upload.json', {
                headers: {
                    ...baseHeaders,
                    ...form.getHeaders(),
                    'x-client-transaction-id': await solver.generateTransactionId('POST', '/1.1/media/upload.json')
                },
                method: 'POST',
                body: form.getBuffer()
            })

            let uploadData = await uploadRes.json()
            if (!uploadData.media_id_string) throw `upload:${JSON.stringify(uploadData)}`;

            mediaId = uploadData.media_id_string
        } else { //im so sorry for this hellcode //18 months later shy: i don't forgive you and i'm not fixing it either
            let initUrl = new URL('https://upload.x.com/1.1/media/upload.json')
            initUrl.searchParams.append('command', 'INIT')
            initUrl.searchParams.append('media_type', mimeType)
            initUrl.searchParams.append('total_bytes', stat.size)
            if (mimeType == 'image/gif') {
                initUrl.searchParams.append('media_category', 'tweet_gif')
            } else if (mimeType.startsWith('video/')) {
                initUrl.searchParams.append('media_category', 'tweet_video')
            }

            let initRes = await fetch(initUrl.href, {
                headers: {
                    ...baseHeaders,
                    ...form.getHeaders(),
                    'x-client-transaction-id': await solver.generateTransactionId('POST', '/1.1/media/upload.json')
                },
                method: 'POST'
            })

            let initData = await initRes.json()
            if (!initData.media_id_string) throw `upload-init:${JSON.stringify(initData)}`;

            mediaId = initData.media_id_string;

            let chunks = []
            let chunkSize = 8 * 1024 * 1024;
            for (let i = 0; i < file.length; i += chunkSize) {
                chunks.push(file.slice(i, i + chunkSize))
            }

            for (let i = 0; i < chunks.length; i++) {
                let chunk = chunks[i]

                let form = new FormData()
                form.setBoundary(generateWebKitBoundary())
                form.append('media', chunk, {
                    filename: fileName,
                    contentType: mimeType
                })

                let appendUrl = new URL('https://upload.x.com/1.1/media/upload.json')
                appendUrl.searchParams.append('command', 'APPEND')
                appendUrl.searchParams.append('media_id', mediaId)
                appendUrl.searchParams.append('segment_index', i)

                let appendRes = await fetch(appendUrl.href, {
                    headers: {
                        ...baseHeaders,
                        ...form.getHeaders(),
                        'x-client-transaction-id': await solver.generateTransactionId('POST', '/1.1/media/upload.json')
                    },
                    method: 'POST',
                    body: form.getBuffer()
                })

                if (!appendRes.ok) throw `upload-append:${await appendRes.text()}`;
            }

            let finalizeUrl = new URL('https://upload.x.com/1.1/media/upload.json')
            finalizeUrl.searchParams.append('command', 'FINALIZE')
            finalizeUrl.searchParams.append('media_id', mediaId)

            let finalizeRes = await fetch(finalizeUrl.href, {
                headers: {
                    ...baseHeaders,
                    ...form.getHeaders(),
                    'x-client-transaction-id': await solver.generateTransactionId('POST', '/1.1/media/upload.json')
                },
                method: 'POST'
            })

            let finalizeData = await finalizeRes.json()
            if (!finalizeData.media_id_string) throw `upload-finalize:${JSON.stringify(finalizeData)}`;

            async function waitForUpload() { //recursively check the progress when it wants and wait until its done processing
                //nesting hell
                try {
                    return await new Promise(async (resolve, reject) => {
                        async function check() {
                            let statusUrl = new URL('https://upload.x.com/1.1/media/upload.json')
                            statusUrl.searchParams.append('command', 'STATUS')
                            statusUrl.searchParams.append('media_id', mediaId)

                            let statusRes = await fetch(statusUrl.href, {
                                headers: {
                                    ...baseHeaders,
                                    ...form.getHeaders(),
                                    'x-client-transaction-id': await solver.generateTransactionId('GET', '/1.1/media/upload.json')
                                }
                            })

                            let statusData = await statusRes.json()

                            if (!statusData.media_id_string || (statusData.processing_info.state !== 'pending' && statusData.processing_info.state !== 'in_progress' && statusData.processing_info.state !== 'succeeded')) {
                                reject(`upload-status:${JSON.stringify(statusData)}`)
                            } else if (statusData.processing_info.state == 'succeeded') {
                                resolve()
                            } else {
                                setTimeout(async () => await check(), statusData.processing_info.check_after_secs * 1000)
                            }
                        }

                        await check()
                    })
                } catch (err) {
                    throw err;
                }
            }

            await waitForUpload()
        }

        let postRes = await fetch('https://x.com/i/api/graphql/zkcFc6F-RKRgWN8HUkJfZg/CreateTweet', {
            headers: {
                ...baseHeaders,
                'Content-Type': 'application/json',
                'x-client-transaction-id': await solver.generateTransactionId('POST', '/i/api/graphql/zkcFc6F-RKRgWN8HUkJfZg/CreateTweet')
            },
            method: 'POST',
            body: JSON.stringify({
                queryId: 'zkcFc6F-RKRgWN8HUkJfZg',
                variables: {
                    tweet_text: fileName,
                    media: {
                        media_entities: [
                            {
                                media_id: mediaId,
                                tagged_users: []
                            }
                        ],
                        possibly_sensitive: false
                    },
                    semantic_annotation_ids: []
                },
                features: {
                    premium_content_api_read_enabled: false,
                    communities_web_enable_tweet_community_results_fetch: true,
                    c9s_tweet_anatomy_moderator_badge_enabled: true,
                    responsive_web_grok_analyze_button_fetch_trends_enabled: false,
                    responsive_web_grok_analyze_post_followups_enabled: true,
                    responsive_web_jetfuel_frame: true,
                    responsive_web_grok_share_attachment_enabled: true,
                    responsive_web_grok_annotations_enabled: true,
                    responsive_web_edit_tweet_api_enabled: true,
                    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
                    view_counts_everywhere_api_enabled: true,
                    longform_notetweets_consumption_enabled: true,
                    responsive_web_twitter_article_tweet_consumption_enabled: true,
                    tweet_awards_web_tipping_enabled: false,
                    content_disclosure_indicator_enabled: true,
                    content_disclosure_ai_generated_indicator_enabled: true,
                    responsive_web_grok_show_grok_translated_post: false,
                    responsive_web_grok_analysis_button_from_backend: true,
                    post_ctas_fetch_enabled: true,
                    longform_notetweets_rich_text_read_enabled: true,
                    longform_notetweets_inline_media_enabled: false,
                    profile_label_improvements_pcf_label_in_post_enabled: true,
                    responsive_web_profile_redirect_enabled: false,
                    rweb_tipjar_consumption_enabled: false,
                    verified_phone_label_enabled: false,
                    articles_preview_enabled: true,
                    responsive_web_grok_community_note_auto_translation_is_enabled: false,
                    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                    freedom_of_speech_not_reach_fetch_enabled: true,
                    standardized_nudges_misinfo: true,
                    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
                    responsive_web_grok_image_annotation_enabled: true,
                    responsive_web_grok_imagine_annotation_enabled: true,
                    responsive_web_graphql_timeline_navigation_enabled: true,
                    responsive_web_enhance_cards_enabled: false
                }
            })
        })

        let postData = await postRes.json()
        if (!postData?.data?.create_tweet?.tweet_results?.result?.rest_id) throw `post:${JSON.stringify(postData)}`

        return true;
    } catch (err) {
        console.log(`twitter: failed to post ${fileName}`, err)
        console.error('twitter error: ', err)
        return false;
    }
}

function generateWebKitBoundary() {
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let bytes = crypto.randomBytes(16)

    let out = '----WebKitFormBoundary'

    for (let i = 0; i < 16; i++) {
        out += chars[bytes[i] % chars.length]
    }

    return out;
}

module.exports.init = init;
module.exports.post = post;
module.exports.isEnabled = function() {
    return config.twitter.use;
}