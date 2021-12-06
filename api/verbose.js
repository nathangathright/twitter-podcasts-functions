const got = require("got")
const xmlGot = got.extend(require("got-xml")())
const { JSDOM } = require("jsdom")
const normalizeUrl = require('normalize-url')

const formatNumber = (number) =>
  (/^\d+(\.\d+)?%$/.test(number)) ? null : parseInt(number, 10)

const formatURL = (link) =>
  normalizeUrl(link, {forceHttps: true})

const getTwitter = (dom) => {
  const meta = (selector) => {
    const element = dom.querySelector(`meta[name="${selector}"], meta[property="${selector}"]`)
    return element ? element.getAttribute('content') : null
  }

  if (meta('twitter:player')) {
    return {
      url: formatURL(meta('twitter:player')),
      stream: formatURL(meta('twitter:player:stream')),
      width: formatNumber(meta('twitter:player:width')),
      height: formatNumber(meta('twitter:player:height')),
    }
  } else {
    return null
  }

}

const oEmbedJSON = async (url) => {
  const response = await got(url).json()
  const width = formatNumber(response.width),
  const height = formatNumber(response.height),
  const iframe = JSDOM.fragment(response.html).querySelector('iframe')
  const src = iframe ? formatURL(iframe.getAttribute('src')) : null

  if (src) {
    return {
      url: src,
      width,
      height,
    }
  } else {
    return null
  }
}

const oEmbedXML = async (url) => {
  const response = await xmlGot(url)
  const width = formatNumber(response.body.oembed.width[0]),
  const height = formatNumber(response.body.oembed.height[0]._),
  const CDATA = response.body.oembed.html[0];
  const regex = /src=\"([^"]+)\"/;
  const src = regex.exec(CDATA)[1];

  if (src) {
    return {
      url: src,
      width,
      height,
    }
  } else {
    return null
  }
}

const getOembed = async (dom) => {
  const jsonElement = dom.querySelector('link[type="application/json+oembed"]')  
  const xmlElement = dom.querySelector('link[type="text/xml+oembed"]')  
  if (jsonElement) {
    const url = formatURL(jsonElement.getAttribute('href'))
    return await oEmbedJSON(url)
  }
  else if (xmlElement) {
    const url = formatURL(xmlElement.getAttribute('href'))
    return await oEmbedXML(url)
  }
  else {
    return null
  }
}

const getOther = async (link, dom) => {
  switch (true) {
    case /podcasts\.apple\.com.*\?i=/.test(link):
      return {
        url: link.replace('podcasts.apple.com', 'embed.podcasts.apple.com'),
        width: 480,
        height: 175,
      }
    case /podcasts\.apple\.com/.test(link):
      return {
        url: link.replace('podcasts.apple.com', 'embed.podcasts.apple.com'),
        width: 320,
        height: 432,
      }
    case /simplecast.com/.test(link):
      return await fetchJsonOembed(`https://api.simplecast.com/oembed?url=${link}`)
    case /rss.com/.test(link):
      return {
        url: link.replace('rss.com', 'player.rss.com'),
        width: null,
        height: 140,
      }
    default:
      break;
  }
}

export default async (req, res) => {
  const url = normalizeUrl(req.query.url, {forceHttps: true})
  const { document } = (await JSDOM.fromURL(url)).window
  
  Promise.all([
    getTwitter(document),
    getOembed(document),
    getOther(url, document),
  ]).then(([twitter, oEmbed, other]) => {
    res.status(200).json({
      twitter,
      oEmbed,
      other
    })
  })
}
