const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const chromium = require('@sparticuz/chrome-aws-lambda');
const cheerio = require('cheerio');
const log4js = require('log4js');

const { region, logLevel, mangaTable, scraperQueueUrl } = process.env;

log4js.configure({
  appenders: { logger: { type: 'console' } },
  categories: { default: { appenders: ['logger'], level: logLevel } },
});

const logger = log4js.getLogger('logger');

async function crawler (urlString) {
  logger.debug(`In crawler: ${urlString}`);
  const browser = await chromium.puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 5.1; rv:5.0) Gecko/20100101 Firefox/5.0');
    await page.setRequestInterception(true);
    page.on('close', (request) => {
      if (request.resourceType() !== 'document') request.abort();
      else request.continue();
    });
    const response = await page.goto(urlString, { waitUntil: 'domcontentloaded' });
    if (!response.ok()) throw new Error(`Failed to crawl '${urlString}'`, { cause: response.status() });
    return await page.content();
  } catch (error) {
    throw error;
  } finally {
    await browser.close();
  }
}

function loadHTML (htmlString) {
  logger.debug(`In loadHTML`);
  if (htmlString.constructor === Error) throw htmlString;
  return cheerio.load(htmlString);
}

function parseMangaList ($, mangaProvider) {
  logger.debug(`In parseMangaList`);
  const MangaList = new Set();
  $('a.series', 'div.soralist').each((index, element) => {
    const MangaTitle = $(element).text().trim();
    const MangaUrl = $(element).attr('href');
    const MangaSlug = MangaUrl.split('/').slice(-2).shift().replace(/[\d]*[-]?/, '');
    const timestamp = new Date().toUTCString();
    const Manga = new Map([
      ['_type', `series_${mangaProvider}`],
      ['_id', MangaSlug],
      ['MangaTitle', MangaTitle],
      ['MangaUrl', MangaUrl],
      ['ScrapeDate', timestamp],
    ]);
    MangaList.add(Manga);
  });
  return MangaList;
}

function parseManga ($, mangaProvider) {
  logger.debug(`In parseManga`);
  const MangaTitle = $('h1.entry-title').text().trim();
  let MangaSynopsis = $('p', 'div.entry-content').text();
  if (!MangaSynopsis) MangaSynopsis = $('div.entry-content').contents().text();
  const MangaCover = $('img', 'div.thumb').attr('src');
  const MangaShortUrl = $('link[rel="shortlink"]').attr('href');
  const MangaCanonicalUrl = $('link[rel="canonical"]').attr('href');
  const MangaSlug = MangaCanonicalUrl.split('/').slice(-2).shift().replace(/[\d]*[-]?/, '');
  const timestamp = new Date().toUTCString();
  const Manga = new Map([
    ['_type', `series_${mangaProvider}`],
    ['_id', MangaSlug],
    ['MangaTitle', MangaTitle],
    ['MangaSynopsis', MangaSynopsis],
    ['MangaCover', MangaCover],
    ['MangaShortUrl', MangaShortUrl],
    ['MangaCanonicalUrl', MangaCanonicalUrl],
    ['ScrapeDate', timestamp],
  ]);
  return Manga;
}

function parseChapterList ($, mangaProvider) {
  logger.debug(`In parseChapterList`);
  const MangaSlug = $('link[rel="canonical"]').attr('href').split('/').slice(-2).shift().replace(/[\d]*[-]?/, '');
  const ChapterList = new Set();
  $('a', 'div.eplister').each((index, element) => {
    let ChapterNumber = $('span.chapternum', element).text().trim();
    if (ChapterNumber.includes('\n')) ChapterNumber = ChapterNumber.split('\n').slice(-2).join(' ');
    const ChapterDate = $('span.chapterdate', element).text().trim();
    const ChapterOrder = $(element).parents('li').data('num');
    const ChapterUrl = $(element).attr('href');
    const ChapterSlug = ChapterUrl.split('/').slice(-2).shift().replace(/[\d]*[-]?/, '');
    const timestamp = new Date().toUTCString();
    const Chapter = new Map([
      ['_type', `chapter_${mangaProvider}_${MangaSlug}`],
      ['_id', ChapterSlug],
      ['ChapterOrder', ChapterOrder],
      ['ChapterNumber', ChapterNumber],
      ['ChapterUrl', ChapterUrl],
      ['ChapterDate', ChapterDate],
      ['ScrapeDate', timestamp],
    ]);
    ChapterList.add(Chapter);
  });
  return ChapterList;
}

function parseChapter ($, mangaProvider) {
  logger.debug(`In parseChapter`);
  const ChapterTitle = $('h1.entry-title').text().trim();
  const ChapterShortUrl = $('link[rel="shortlink"]').attr('href');
  let ChapterCanonicalUrl = $('link[rel="canonical"]').attr('href');
  if (!ChapterCanonicalUrl) ChapterCanonicalUrl = $('meta[property="og:url"]').attr('content');
  const ChapterSlug = ChapterCanonicalUrl.split('/').slice(-2).shift().replace(/[\d]*[-]?/, '');
  const navScript = $('script:contains("ts_reader.run")').contents().text();
  const ChapterPrevSlug = navScript.match(/'prevUrl':'(.*?)'/)[1].split('/').slice(-2).shift().replace(/[\d]*[-]?/, '').replace(/\\/, '');
  const ChapterNextSlug = navScript.match(/'nextUrl':'(.*?)'/)[1].split('/').slice(-2).shift().replace(/[\d]*[-]?/, '').replace(/\\/, '');
  const timestamp = new Date().toUTCString();
  const ChapterContent = new Set();
  if (mangaProvider === 'realm') {
    const realmContent = $('div#readerarea').contents().text();
    $('img[class*="wp-image"]', realmContent).each((index, element) => {
      const img = $(element).attr('src');
      ChapterContent.add(img);
    });
  } else {
    $('img[class*="wp-image"]', 'div#readerarea').each((index, element) => {
      const img = $(element).attr('src');
      ChapterContent.add(img);
    });
  }
  if (!ChapterContent.size) {
    $('img[class*="size-full"]', 'div#readerarea').each((index, element) => {
      const img = $(element).attr('src');
      ChapterContent.add(img);
    });
  }
  const Chapter = new Map([
    ['_type', mangaProvider],
    ['_id', ChapterSlug],
    ['ChapterTitle', ChapterTitle],
    ['ChapterShortUrl', ChapterShortUrl],
    ['ChapterCanonicalUrl', ChapterCanonicalUrl],
    ['ChapterPrevSlug', ChapterPrevSlug],
    ['ChapterNextSlug', ChapterNextSlug],
    ['ChapterContent', ChapterContent],
    ['ScrapeDate', timestamp],
  ]);
  return Chapter;
}

async function scraper (urlString, requestType, mangaProvider) {
  try {
    const htmlString = await crawler(urlString);
    const $ = loadHTML(htmlString);
    let result;
    switch (requestType) {
      case 'MangaList':
        result = parseMangaList($, mangaProvider);
        break;
      case 'Manga':
        result = parseManga($, mangaProvider);
        break;
      case 'ChapterList':
        result = parseChapterList($, mangaProvider);
        break;
      case 'Chapter':
        result = parseChapter($, mangaProvider);
        break;
    }
    logger.debug(`Scraper success: ${requestType} - ${urlString}`);
    return result;
  } catch (error) {
    logger.error(`Scraper fail: ${requestType} - ${urlString}`);
    throw error;
  }
}

exports.handler = async function (event, context) {
  if (event.Records) {
    return Promise.all(event.Records.map(async function (message) {
      try {
        const body = JSON.parse(message.body);
        logger.debug(message)
        /* 
        const scraperData = {
          'urlToScrape': providerMap.get(provider),
          'requestType': 'MangaList',
          'provider': provider,
        };
        */
        // const scraperResponse = await scraper();
      } catch (error) {
        logger.error(error)
      }
      // TODO process queue
      // TODO update table
      // TODO delete message
    }));
  }
};
