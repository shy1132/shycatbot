//shycatbot
//aka the 9,001st automated image tweeter

//requires
const fs = require('fs').promises
const path = require('path')
const mime = require('mime-types')
const config = require('./config.json')

//code
let platforms = {
    twitter: require('./services/twitter-user.js'),
    bluesky: require('./services/bluesky.js'),
    threads: require('./services/threads.js'),
    instagram: require('./services/instagram.js'),
    tumblr: require('./services/tumblr.js'),
    mastodon: require('./services/mastodon.js'),
    firefish: require('./services/firefish.js')
}

if (config.twitter.userAuth) platforms.twitter = require('./services/twitter-user.js')

let platformKeys = Object.keys(platforms);
platformKeys = platformKeys.reverse()
platformKeys = platformKeys.sort((a, b) => {
    let indexA = config.priorityList.indexOf(a)
    let indexB = config.priorityList.indexOf(b)

    if (indexA === -1 && indexB === -1) { //if both not in priority list, keep original order
      return 0;
    }

    if (indexA === -1) { //if element not in priority list, move it to the end
        return 1;
    }

    if (indexB === -1) { //same deal
        return -1;
    }

    return indexA - indexB;
})

let usedPlatforms = [];

function logSegment() {
    return console.log('-'.repeat(64));
}

async function initialize() {
    console.log('initializing')

    let configs = platformKeys.map((platform) => config[platform])
    let allMimeTypes = configs.filter(config => config.use && config.mimeTypes).map(config => config.mimeTypes)[0]

    if (config.syncPosts) {
        console.log('sync posts is on; compatible media types are limited to only ones all used platforms support, which removes a lot of potential for posts')

        let commonMimeTypes = allMimeTypes.filter((value) => allMimeTypes.every((array) => array.includes(value)))
        config.mimeTypes = commonMimeTypes;
    } else {
        console.log('sync posts is off; if the bot tries to post media that isn\'t supported on a platform, it will choose a different file for that platform')
        config.mimeTypes = allMimeTypes;
    }

    for (let platform of platformKeys) {
        if (config[platform].use) {
            let response;
            try {
                response = await platforms[platform].init()
            } catch {
                console.log(`uncaught error occurred while initializing ${platform}, disabling`)
                response = false;
            }

            if (response === false) {
                config[platform].use = false;
            } else {
                usedPlatforms.push(platform)
            }
        }
    }

    if (usedPlatforms.length < 1) return console.log('u have no platforms enabled or they all failed');

    logSegment()

    postRandomFile()
    setInterval(postRandomFile, config.postIntervalMs)
}

async function postRandomFile() {
    let file = await getRandomFile(config.mimeTypes);
    if (file.error) return console.log(`error ${file.error}, waiting until next interval`);

    console.log(`posting ${file.fileName}`)

    let promises = []

    for (let platform of platformKeys) { //a bit hard to read but its dynamic so i wont really ever have to change this
        let platformConfig = config[platform]
        if (platformConfig.use) platformConfig.use = platforms[platform].isEnabled();
        if (!platformConfig.use) continue;

        let isAboveSizeLimit = false;
        if (
            (platformConfig.globalSizeLimit && file.size > platformConfig.globalSizeLimit) ||
            (file.mimeType.startsWith('image/') && platformConfig.imageSizeLimit && file.size > platformConfig.imageSizeLimit) ||
            (file.mimeType == 'image/gif' && platformConfig.gifSizeLimit && file.size > platformConfig.gifSizeLimit) ||
            (file.mimeType.startsWith('video/') && platformConfig.videoSizeLimit && file.size > platformConfig.videoSizeLimit)
        ) { 
            isAboveSizeLimit = true;
        }

        if (((platformConfig.mimeTypes && !platformConfig.mimeTypes.includes(file.mimeType)) || isAboveSizeLimit) && !config.syncPosts) {
            console.log(`${platform}: ${file.fileName} (${file.mimeType}, ${file.size} bytes) unsuitable, picking different file for ${platform}`)

            let differentFile = await getRandomFile(platformConfig.mimeTypes, platformConfig.sizeLimit);
            if (file.error && file.error == 'no_files') {
                console.log(`${platform}: no files match the platform's mimetypes, disabling this platform`);
                config[platform].use = false;
                continue;
            }

            console.log(`${platform}: posting ${differentFile.fileName}`)

            let promise = platforms[platform].post(differentFile.fileName, differentFile.filePath, differentFile.mimeType)
            promises.push(promise)
        } else {
            console.log(`${platform}: posting ${file.fileName}`)

            let promise = platforms[platform].post(file.fileName, file.filePath, file.mimeType)
            promises.push(promise)
        }
    }

    await Promise.all(promises)
    logSegment()
}

async function getRandomFile(mimeTypes, sizeLimit) {
    let file;
    do { //its Technically possible that this could just cause an infinite loop until the heat death of the universe, but Walter Summerford isn't the one using this bot so i'm not too concerned
        let files = await fs.readdir(config.directory)
        if (mimeTypes) files = files.filter(name => mimeTypes.includes(mime.lookup(name))) //remove all mime types that arent in mimeTypes (if mimeTypes is supplied)
        if (files.length < 1) {
            console.log(`no files fitting these mime types could be found: ${mimeTypes.join(', ')}`)
            return { error: 'no_files' }; //Do Not run until the heat death of the universe
        }

        let fileName = files[Math.floor(Math.random() * files.length)]
        let filePath = path.join(config.directory, fileName)
        let fileExtension = path.parse(fileName).ext?.toLowerCase()
        if (!fileExtension) continue;

        let fileStat = await fs.stat(filePath)
        let size = fileStat.size;
        if (sizeLimit && size > sizeLimit) continue;

        let mimeType = mime.lookup(fileExtension)
        if (!mimeType) continue;

        file = { fileName, filePath, mimeType, size }
    } while (!file)

    return file;
}

initialize()