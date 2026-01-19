import puppeteer, { Browser, Page } from 'puppeteer';
import logger from './logger.js';
import path from 'path';

let browserInstance: Browser | null = null;
let launchingPromise: Promise<Browser> | null = null;
let sharedPage: Page | null = null;

export async function getBrowser(): Promise<Browser> {
    if (browserInstance) {
        return browserInstance;
    }

    // 防止并发调用时多次启动
    if (launchingPromise) {
        return launchingPromise;
    }

    logger.info('Launching new Puppeteer browser instance...');
    launchingPromise = puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }).then(browser => {
        browserInstance = browser;
        launchingPromise = null;

        browser.on('disconnected', () => {
            logger.warn('Puppeteer browser disconnected. Clearing instance.');
            browserInstance = null;
            sharedPage = null; // Clear shared page as well
        });

        return browser;
    }).catch(err => {
        launchingPromise = null;
        logger.error('Failed to launch puppeteer', err);
        throw err;
    });

    return launchingPromise;
}

export async function getSharedPage(): Promise<Page> {
    if (sharedPage && !sharedPage.isClosed()) {
        return sharedPage;
    }

    const browser = await getBrowser();
    // 检查是否有现有页面可用 (Puppeteer 启动时通常会带一个空页面)
    const pages = await browser.pages();
    if (pages.length > 0) {
        sharedPage = pages[0];
    } else {
        sharedPage = await browser.newPage();
    }

    // 预加载 LWC 库
    try {
        const lwcPath = path.resolve(process.cwd(), 'node_modules', 'lightweight-charts', 'dist', 'lightweight-charts.standalone.production.js');
        await sharedPage.addScriptTag({ path: lwcPath });
        logger.info('Lightweight Charts library pre-loaded into shared page.');
    } catch (err) {
        logger.error('Failed to pre-load LWC library', err);
    }

    return sharedPage;
}

export async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
        sharedPage = null;
    }
}
