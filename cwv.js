const csv = require('csv-parser');
const Json2csv = require('json2csv').Parser;
const { chromium, devices } = require('playwright');
const android = devices['Galaxy S5'];
const fs = require('fs');
let jsContent = fs.readFileSync('./ttbcwv.js');
let inputFile = null;
let outputFile = null;
let throttle = true;
let desktop = false;
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
    return `${sanitized}_${timeStamp}.webm`;
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
if (!inputFile || !outputFile) {
    console.log("input=  & output= needed!");
}
(async() => {
    let op = [];
    const getMetric = async function(url, cookie) {
        const browser = await chromium.launch();

        let context = await browser.newContext({
            ...android,
            recordVideo: {
                dir: 'videos/'
            }
        })
        if (desktop) {
            await context.close();
            context = await browser.newContext({
                recordVideo: {
                    dir: 'videos/'
                }
            })
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
                waitUntil: 'networkidle0'
            });
            try {
                await page.addScriptTag({ content: jsContent.toString() })
            } catch (e) {
                console.log(e);
            }
            await page.waitForTimeout(300);
            if (cookie !== '') {
                await page.click(cookie);
            } else {
                await page.evaluate(() => {
                    const elem = document.createElement('a');
                    elem.id = 'ttbClickTarget';
                    elem.href = '#';
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

            const metricsArray = await Promise.race([page.evaluate(() => {
                    return new Promise(resolve => {
                        let FID = 0;
                        let CLS = 0;
                        let LCP = 0;
                        let CLSscore = { CLS: 0, verdict: 'good - none measured' };
                        let CLSentries = [];
                        let LCPVerdict = 0;
                        let LCPElement = '';
                        let FIDVerdict = 0;

                        function sendMetrics() {
                            setTimeout(function() {
                                resolve({
                                    CLSscore,
                                    CLSentries,
                                    FID: FIDVerdict,
                                    LCP: LCPVerdict
                                }), 3000
                            });
                        }

                        new PerformanceObserver(list => {
                            list.getEntries().forEach(entry => {
                                LCP = parseFloat(entry.renderTime);
                                if (LCP === 0) {
                                    LCP = parseFloat(entry.loadTime);
                                }

                                let n = entry.element.nodeName;

                                if (entry.element.id !== '') {
                                    n += '#' + entry.element.id;
                                }
                                if (entry.element.className !== '') {
                                    n += '.' + entry.element.className.replace(/ /g, '.');
                                }
                                LCPElement = n.replace('.ttb-lcp-candidate', '');

                                let ver = 'good';
                                if (LCP > 2500 && LCP <= 4000) {
                                    ver = 'needs improvement';
                                }
                                if (LCP > 4000) {
                                    ver = 'poor';
                                }
                                LCPVerdict = {
                                    lcp: `${(LCP / 1000).toFixed(2)} s`,
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
                                    fid: `${FID.toFixed(4)} Ms`,
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
            let playwrightVidname = await page.video().path();
            const finalVidname = sanitizeURL(url);
            await browser.close();
            fs.renameSync(`videos/${playwrightVidname.replace(/^videos\\/g, '').replace(/^videos/g, '')}`, `videos/${finalVidname}`);
            metricsArray.videoPath = `videos/${finalVidname}`
            return metricsArray;
        } catch (err) {
            console.log('Error loading page:', err);
            await browser.close();
            return
        }
    }
    let testURLs = []
    const csvPipe = fs.createReadStream(inputFile).pipe(csv());
    csvPipe.on('data', async(row) => {
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
                console.log(`${i + 1} of ${urls.length} `, urls[i].url, `LCP: ${data.FID.fid} FID: ${data.FID.fid} CLS: ${data.CLSscore.CLS}`)
                op.push({ url: urls[i].url, CLS: data.CLSscore.CLS, CLSVerdict: data.CLSscore.verdict, CLSentries: JSON.stringify(data.CLSentries, null, 2), FID: data.FID.fid, FIDVerdict: data.FID.verdict, LCP: data.LCP.lcp, LCPVerdict: data.LCP.verdict, LCPElement: data.LCP.element, video: data.videoPath })
            } else {
                console.log(`${i + 1} of ${urls.length} `, urls[i].url, 'Error');
                op.push({
                    url: urls[i].url,
                    CLS: 'Error',
                    CLSVerdict: '',
                    CLSentries: '',
                    FID: '',
                    FIDVerdict: '',
                    LCP: '',
                    LCPVerdict: '',
                    LCPElement: '',
                    video: ''
                })
            }
        }
        console.log(`creating ${outputFile}`);
        const j2csv = new Json2csv(['url', 'CLS', 'CLS Verdict', 'CLS Entries', 'FID', 'FID Verdict', 'LCP', 'LCP Verdict', 'LCP Element', 'Video']);
        const csv = j2csv.parse(op);
        fs.writeFileSync(outputFile, csv, 'utf-8')
        console.log(`${outputFile} saved - done!`);
    }
})();

async function autoScroll(page) {
    await page.evaluate(async() => {
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