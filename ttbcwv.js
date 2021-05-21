const myStringOfstyles = `
            .ttb-lcp-candidate {
                outline: 4px dashed goldenrod !important;
                outline-offset: -4px;
            }
            `;
var style = document.createElement('style');
style.innerText = myStringOfstyles;
document.head.appendChild(style);

function sendToHolder({
    name,
    delta,
    verdict
}) {
    var holder = document.getElementById('webVitalsHolder');
    if (typeof(holder) === 'undefined' || holder === null) {
        var holder = document.createElement('span');
        holder.id = 'webVitalsHolder';
        holder.style.position = 'fixed';
        holder.style.bottom = 0;
        holder.style.left = 0;
        holder.style.margin = '5px';
        holder.style.padding = '5px';
        holder.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", Arial, sans-serif;';
        holder.style.fontSize = '12px';
        holder.style.backgroundColor = '#fff';
        holder.style.color = '#000';
        holder.style.border = '1px solid #000';
        holder.style.borderRadius = '0.5rem';
        holder.style.boxShadow = '0 25px 50px -12px rgba(0,0,0,.25)';
        holder.style.zIndex = '999999';
        document.body.appendChild(holder);
    }
    var element = document.getElementById('webVital-' + name);
    if (typeof(element) !== 'undefined' && element !== null) {
        if (verdict === 0) {
            element.style.color = '#0cce6b';
        } else if (verdict === 1) {
            element.style.color = '#ffa400';
        } else if (verdict === 2) {
            element.style.color = '#ff4e42';
        }
        element.innerText = ` ${name}: ${delta}`;
    } else {
        var extractionSpan = document.createElement('span');
        extractionSpan.id = 'webVital-' + name;
        if (verdict === 0) {
            extractionSpan.style.color = '#0cce6b';
        } else if (verdict === 1) {
            extractionSpan.style.color = '#ffa400';
        } else if (verdict === 2) {
            extractionSpan.style.color = '#ff4e42';
        }
        extractionSpan.innerText = ` ${name}: ${delta}`;
        holder.appendChild(extractionSpan);
    }
}
let ttbCLS = 0,
    ttbLCP = 0,
    ttbFID = 0,
    ttbCLSmax = 0,
    ttbCLSCurr = 0;
sendToHolder({
    name: 'old CLS',
    delta: ttbCLS.toFixed(4),
    verdict: 0
});
sendToHolder({
    name: 'new CLS',
    delta: ttbCLSmax.toFixed(4),
    verdict: 0
});
var firstHiddenTime = document.visibilityState === 'hidden' ? 0 : Infinity;
document.addEventListener('visibilitychange', (event) => {
    firstHiddenTime = Math.min(firstHiddenTime, event.timeStamp);
}, {
    once: true
});
let ttbfirstTs = Number.NEGATIVE_INFINITY,
    ttbprevTs = Number.NEGATIVE_INFINITY;

new PerformanceObserver((entryList) => {
    for (const entry of entryList.getEntries()) {
        if (entry.hadRecentInput) continue;
        if (entry.startTime - ttbfirstTs > 5000 || entry.startTime - ttbprevTs > 1000) {
            ttbfirstTs = entry.startTime;
            ttbCLSCurr = 0;
        }
        ttbprevTs = entry.startTime;
        ttbCLSCurr += entry.value;
        ttbCLSmax = Math.max(ttbCLSmax, ttbCLSCurr);
        let ver = 0;
        if (ttbCLSmax > 0.1 && ttbCLSmax <= 0.25) {
            ver = 1;
        }
        if (ttbCLSmax > 0.25) {
            ver = 2;
        }
        sendToHolder({
            name: 'new CLS',
            delta: ttbCLSmax.toFixed(4),
            verdict: ver
        });
    }
}).observe({ type: 'layout-shift', buffered: true });

new PerformanceObserver(list => {
    list.getEntries().forEach(entry => {
        if (entry.hadRecentInput) return;
        const elist = entry.sources;
        elist.forEach((e) => {
            if (e.node && e.node.nodeType !== 3) {
                let exStyle = e.node.style.cssText;

                e.node.style.cssText = `${exStyle} outline: 4px dashed royalblue; outline-offset: -4px;`;
            }
        });
        ttbCLS += parseFloat(entry.value);
        var ver = 0;
        if (ttbCLS > 0.1 && ttbCLS <= 0.25) {
            ver = 1;
        }
        if (ttbCLS > 0.25) {
            ver = 2;
        }
        sendToHolder({
            name: 'old CLS',
            delta: ttbCLS.toFixed(4),
            verdict: ver
        });
    });
}).observe({
    type: 'layout-shift',
    buffered: true
});
new PerformanceObserver(list => {
    list.getEntries().forEach(entry => {
        console.log(entry);
        ttbLCP = parseFloat(entry.renderTime);
        if (ttbLCP === 0) {
            ttbLCP = parseFloat(entry.loadTime);
        }
        [].forEach.call(document.querySelectorAll('.ttb-lcp-candidate'), function(el) {
            el.classList.remove('ttb-lcp-candidate');
        });
        if (entry.element) {
            entry.element.classList.add('ttb-lcp-candidate');
        }
        var ver = 0;
        if (ttbLCP > 2500 && ttbLCP <= 4000) {
            ver = 1;
        }
        if (ttbLCP > 4000) {
            ver = 2;
        }
        sendToHolder({
            name: 'LCP',
            delta: `${(ttbLCP / 1000).toFixed(2)} s`,
            verdict: ver
        });
    });
}).observe({
    type: 'largest-contentful-paint',
    buffered: true
});
new PerformanceObserver(list => {
    list.getEntries().forEach(entry => {
        ttbFID = parseFloat(entry.processingStart - entry.startTime);
        var ver = 0;
        if (ttbFID > 100 && ttbFID <= 300) {
            ver = 1;
        }
        if (ttbFID > 300) {
            ver = 2;
        }
        sendToHolder({
            name: 'FID',
            delta: `${ttbFID.toFixed(4)} Ms`,
            verdict: ver
        });
    });
}).observe({
    type: 'first-input',
    buffered: true
});