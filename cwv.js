const csv = require('csv-parser');
const Json2csv = require('json2csv').Parser;
const { chromium } = require('playwright');

const fs = require('fs');
let jsContent = fs.readFileSync('./ttbcwv.js');
let inputFile = null;
let outputFile = null;
let throttle = true;
let desktop = false;
let traces = false;
let illegalRe = /[\/\?<>\\:\*\|"]/g;
let controlRe = /[\x00-\x1f\x80-\x9f]/g;
let reservedRe = /^\.+$/;
let windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
let windowsTrailingRe = /[\. ]+$/;
let replacement = '';

function sanitizeURL(input) {
    if (typeof input !== 'string') {
        throw new Error('Input must be string');
    }
    let sanitized = input
        .replace(illegalRe, replacement)
        .replace(controlRe, replacement)
        .replace(reservedRe, replacement)
        .replace(windowsReservedRe, replacement)
        .replace(windowsTrailingRe, replacement);
    const timeStamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/ /g, '_').replace(/:/g, '_');
    return `${sanitized}_${timeStamp}`;
}
const args = process.argv.slice(2);
if (args.find(v => v.includes('input='))) {
    inputFile = args.find(v => v.includes('input=')).replace('input=', '');
}
if (args.find(v => v.includes('output='))) {
    outputFile = args.find(v => v.includes('output=')).replace('output=', '');
}
if (args.find(v => v.includes('nothrottle'))) {
    throttle = false;
}
if (args.find(v => v.includes('desktop'))) {
    desktop = true;
}
if (args.find(v => v.includes('traces'))) {
    traces = true;
}
if (!outputFile) {
    const timeStamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/ /g, '_').replace(/:/g, '_');
    outputFile = inputFile.replace('.csv', `-done_${timeStamp}.csv`)
}
if (!inputFile || !outputFile) {
    console.log("input=  & output= needed!");
}
(async () => {
    let op = [];
    const browser = await chromium.launch();
    console.log(`Testing with chromium ${browser.version()}`);
    const android = {
        userAgent: `Mozilla/5.0 (Linux; Android 6.0.1; Moto G (4)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Mobile Safari/537.36`,
        viewport: { width: 360, height: 640 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        defaultBrowserType: 'chromium'
    }
    const getMetric = async function (url, cookie) {


        let context = await browser.newContext({
            ...android,
            recordVideo: {
                dir: 'videos/',
                size: { width: 360, height: 640 }
            }
        })
        if (desktop) {
            await context.close();
            context = await browser.newContext({
                recordVideo: {
                    dir: 'videos/',
                    size: { width: 1280, height: 720 }
                }
            })
        }
        if (traces) {
            await context.tracing.start({ screenshots: true, snapshots: true });
        }

        const page = await context.newPage();

        const client = await page.context().newCDPSession(page);
        if (throttle) {
            await client.send('Network.emulateNetworkConditions', {
                'offline': false,
                'downloadThroughput': 1.5 * 1024 * 1024 / 8,
                'uploadThroughput': 750 * 1024 / 8,
                'latency': 40
            })
            await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        }
        try {
            await page.goto(url, {
                timeout: 60000
            });
            if (cookie !== '') {
                await page.click(cookie);
                try {
                    await page.addScriptTag({ content: jsContent.toString() })
                    await page.waitForTimeout(300);
                } catch (e) {
                    console.log(e);
                }
                await page.waitForTimeout(300);
            } else {
                try {
                    await page.addScriptTag({ content: jsContent.toString() })
                    await page.waitForTimeout(300);
                } catch (e) {
                    console.log(e);
                }
                await page.evaluate(() => {
                    const elem = document.createElement('a');
                    elem.id = 'ttbClickTarget';
                    elem.onclick = "javascript: console.log('clicked');";
                    elem.innerHTML = "fid clicker"
                    elem.style.position = "absolute"
                    elem.style.top = "120px"
                    elem.style.right = "0"
                    elem.style.zIndex = "999"
                    document.body.append(elem);
                });
                await page.click('id=ttbClickTarget');
                await page.evaluate(() => {
                    const elem = document.getElementById('ttbClickTarget');
                    elem.remove();
                });
            }
            await autoScroll(page);
            await page.waitForTimeout(300);
            const metricsArray = await Promise.race([page.evaluate(() => {
                return new Promise(resolve => {
                    let FID = 0;
                    let CLS = 0;
                    let LCP = 0;
                    let CLSscore = { CLS: 0, verdict: 'good - none measured' };
                    let newCLSscore = { CLS: 0, verdict: 'good - none measured' };
                    let CLSentries = [];
                    let LCPVerdict = 0;
                    let LCPElement = '';
                    let FIDVerdict = 0;
                    let TTFB = 0;

                    function sendMetrics() {
                        setTimeout(function () {
                            resolve({
                                CLSscore,
                                newCLSscore,
                                CLSentries,
                                FID: FIDVerdict,
                                LCP: LCPVerdict,
                                TTFB
                            }), 3000
                        });
                    }
                    const perfEntries = performance.getEntriesByType("navigation");
                    const root = perfEntries[0];
                    let ttfbMeasure = root.responseStart - root.requestStart;
                   if (ttfbMeasure > 0) {
                       TTFB = Math.round(ttfbMeasure)
                   }

                    new PerformanceObserver(list => {
                        list.getEntries().forEach(entry => {
                            if (parseFloat(entry.renderTime) !== 0) {
                                LCP = parseFloat(entry.renderTime)
                            } else {
                                parseFloat(entry.renderTime)
                            }
                            if (entry.element) {
                                let n = entry.element.nodeName;

                                if (entry.element.id !== '') {
                                    n += '#' + entry.element.id;
                                }
                                if (entry.element.className !== '') {
                                    n += '.' + entry.element.className.replace(/ /g, '.');
                                }
                                LCPElement = n.replace('.ttb-lcp-candidate', '');
                            } else {
                                LCPElement = '';
                            }

                            let ver = 'good';
                            if (LCP > 2500 && LCP <= 4000) {
                                ver = 'needs improvement';
                            }
                            if (LCP > 4000) {
                                ver = 'poor';
                            }
                            LCPVerdict = {
                                lcp: `${(LCP / 1000).toFixed(2)}`,
                                verdict: ver,
                                element: LCPElement
                            }
                        });
                    }).observe({
                        type: 'largest-contentful-paint',
                        buffered: true
                    });

                    new PerformanceObserver(list => {
                        list.getEntries().forEach(entry => {
                            if (entry.hadRecentInput) return;
                            const elist = entry.sources;
                            let eout = [];
                            elist.forEach((e) => {
                                if (e.node && e.node.nodeType !== 3) {
                                    let n = e.node.nodeName;
                                    if (e.node.id !== '') {
                                        n += '#' + e.node.id;
                                    }
                                    if (e.node.className !== '') {
                                        n += '.' + e.node.className.replace(/ /g, '.');
                                    }
                                    eout.push(n.replace('.ttb-lcp-candidate', ''));
                                }
                            });
                            CLSentries.push({ value: entry.value, sources: JSON.stringify(eout) });
                            CLS += parseFloat(entry.value);
                            let ver = 'good';
                            if (CLS > 0.1 && CLS <= 0.25) {
                                ver = 'needs improvement';
                            }
                            if (CLS > 0.25) {
                                ver = 'poor';
                            }
                            CLSscore = { CLS: CLS.toFixed(4), verdict: ver }
                        });
                    }).observe({
                        type: 'layout-shift',
                        buffered: true
                    });

                    let max = 0,
                        curr = 0,
                        firstTs = Number.NEGATIVE_INFINITY,
                        prevTs = Number.NEGATIVE_INFINITY;

                    new PerformanceObserver((entryList) => {
                        for (const entry of entryList.getEntries()) {
                            if (entry.hadRecentInput) continue;
                            if (entry.startTime - firstTs > 5000 || entry.startTime - prevTs > 1000) {
                                firstTs = entry.startTime;
                                curr = 0;
                            }
                            prevTs = entry.startTime;
                            curr += entry.value;
                            max = Math.max(max, curr);
                            let ver = 'good';
                            if (max > 0.1 && max <= 0.25) {
                                ver = 'needs improvement';
                            }
                            if (max > 0.25) {
                                ver = 'poor';
                            }
                            newCLSscore = { CLS: max.toFixed(4), verdict: ver }
                        }
                    }).observe({ type: 'layout-shift', buffered: true });

                    new PerformanceObserver(list => {
                        list.getEntries().forEach(entry => {
                            FID = parseFloat(entry.processingStart - entry.startTime);
                            let ver = 'good';
                            if (FID > 100 && FID <= 300) {
                                ver = 'needs improvement';
                            }
                            if (FID > 300) {
                                ver = 'poor';
                            }

                            FIDVerdict = {
                                fid: `${FID.toFixed(4)}`,
                                verdict: ver
                            }
                            sendMetrics();
                        });
                    }).observe({
                        type: 'first-input',
                        buffered: true
                    });
                    
                });
            }),
            page.waitForTimeout(5000)
            ]);
            if (traces) {
                await context.tracing.stop({ path: `traces/${sanitizeURL(url)}.zip` });
            }
            await page.close();
            await context.close();
            const finalVidname = `videos/${sanitizeURL(url)}.webm`;
            await page.video().saveAs(finalVidname);
            await page.video().delete();
            metricsArray.videoPath = finalVidname;
            return metricsArray;
        } catch (err) {
            console.log('Error loading page:', err);
            await page.close();
            await context.close();
            return
        }
    }
    let testURLs = []
    const csvPipe = fs.createReadStream(inputFile).pipe(csv());
    csvPipe.on('data', async (row) => {
        csvPipe.pause();
        testURLs.push({ url: row.url, cookie: row.cookie_close });

        csvPipe.resume();
    }).on('end', () => {
        console.log(`${inputFile} - file successfully read`);
        doTest(testURLs);
    });

    async function doTest(urls) {
        console.log(`Testing ${urls.length} URLs`);
        for (let i = 0; i < urls.length; i++) {
            let data = await getMetric(urls[i].url, urls[i].cookie);
            if (data && data.CLSscore) {
                console.log(`${i + 1} of ${urls.length} `, urls[i].url, `TTFB: ${data.TTFB} LCP: ${data.LCP.lcp} FID: ${data.FID.fid} old CLS: ${data.CLSscore.CLS} new CLS: ${data.newCLSscore.CLS}`)
                op.push({ url: urls[i].url, newCLS: data.newCLSscore.CLS, newCLSVerdict: data.newCLSscore.verdict, oldCLS: data.CLSscore.CLS, oldCLSVerdict: data.CLSscore.verdict, CLSentries: JSON.stringify(data.CLSentries, null, 2), FID: data.FID.fid, FIDVerdict: data.FID.verdict, LCP: data.LCP.lcp, LCPVerdict: data.LCP.verdict, LCPElement: data.LCP.element, TTFB: data.TTFB, video: data.videoPath })
            } else {
                console.log(`${i + 1} of ${urls.length} `, urls[i].url, 'Error');
                op.push({
                    url: urls[i].url,
                    newCLS: 'Error',
                    newCLSVerdict: '',
                    oldCLS: '',
                    oldCLSVerdict: '',
                    CLSentries: '',
                    FID: '',
                    FIDVerdict: '',
                    LCP: '',
                    LCPVerdict: '',
                    LCPElement: '',
                    TTFB: '',
                    video: ''
                })
            }
        }
        console.log(`creating ${outputFile}`);
        const j2csv = new Json2csv(['url', 'newCLS', 'newCLS Verdict', 'oldCLS', 'OldCLS Verdict', 'CLS Entries', 'FID (Ms)', 'FID Verdict', 'LCP (s)', 'LCP Verdict', 'LCP Element', 'Video']);
        const csv = j2csv.parse(op);
        fs.writeFileSync(outputFile, csv, 'utf-8')
        console.log(`${outputFile} saved - done!`);
        await browser.close();
    }
})();

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            var totalHeight = 0;
            var distance = 100;
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}