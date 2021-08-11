# massWebVitals
A node CLI script to grab [Largest Contentful Paint](https://web.dev/lcp/), [First Input Delay](https://web.dev/fid/), [Cumulative Layout Shift](https://web.dev/cls/) & [Time to first byte (TTFB)](https://web.dev/time-to-first-byte/) for a list of pages specified in a `.csv` file.

The script will load the page, scroll down it's entire length & capture a video in `.webm` format, with the CWV overlaid (in most cases). It will then produce a `.csv` value with the test results for each URL, and a reference to the video file.

As of version 0.0.5, the script will give you both the older style Cumulative Layout Shift, and the new, maximum session window with 1 second gap, capped at 5 seconds one, as [detailed here](https://web.dev/evolving-cls/), named old & new CLS respectively.

## Important!!!
Like some drinks are best served chilled, the Core Web Vitals are best as Real User Metrics. This script is far from that and fits firmly in the Lab test bucket. All the figures should be treated as synthetic, especially `FID`. 

Rather as a definitive score, this is probably best treated as a comparative testing tool. 

### Shouldn't I Just Use Lighthouse?
Lighthouse is an awesome tool, I use it too! Plus you get _A LOT_ more that CWV! This isn't something intended to replace it!

But … It doesn't scroll the page or offer video capture at the moment. Scrolling the page will catch some of the CLS that other lab tools miss, around lazy load things, for example. There are still clear blind spots, like interacting with menus etc.

## Install
* Click on [The lastest release](https://github.com/dwsmart/massWebVitals/releases/latest) and download the zip or tar.gz.
* OR you can clone this repository, [see guide](https://docs.github.com/en/github/creating-cloning-and-archiving-repositories/cloning-a-repository). This will get the very latest code, which might be untested.
* OR you can download the zip file (click the green code button and click Download Zip). Like cloning, this will get the very latest code, which might be untested.

Then on the command line, whilst in the directory you cloned or extracted the files to:
```
npm install
```

## Using the Script
### Create an input CSV file
There is an example file here: [example/input.csv](example/input.csv) for you to look at that would test my site, and amazon.co.uk.

The file needs to be a comma delimitated file, in `UTF-8` with two columns. The first row should be a header, with `url` in the first column (case matters) and `cookie_close` in the second.

Then a new row for each URL you want to test. 

#### url
The full URL of the page you want to test

#### cookie_close
Cookie / GDPR banners sure get in the way huh? This column lets you specify a selector for the dismiss button, link whatever. It uses the standard [playwright selectors format](https://playwright.dev/docs/selectors). The easiest way is to find the id, or another attribute and select like that. In the amazon example, the cookie accept button looks like this:
```html
<span class="a-button-inner"><input id="sp-cc-accept" tabindex="1" name="accept" class="a-button-input celwidget" type="submit" value="all" aria-labelledby="a-autoid-0-announce" data-csa-c-id="ti6ydy-7t812u-l561km-d120ot" data-cel-widget="sp-cc-accept"><span class="a-button-text" aria-hidden="true" id="a-autoid-0-announce">Accept Cookies</span></span>
```
The `data-cel-widget="sp-cc-accept"` seems consistent, so we can use that to target the click. in the `cookie_close` column we enter `[data-cel-widget=sp-cc-accept]`. Note we've wrapped it in square brackets, and removed the double quotes.

If this field it present, the script will wait for this element, and click on it. (This also serves to record FID). Some experimentation might be needed, as if the selector is wrong, or the element is hidden under another one. The click and the test will fail for that URL.

If you don't need to clear a GDPR banner, (or there isn't one!) leave this column empty. In this case, the script will insert a link, click that, and remove it to gather FID.

### Running the Script
On the command line, whilst in the directory you cloned or extracted the files to:

```
node cwv input=example/input.csv output=example/output.csv
```

`input=` is the relative path to the CSV you created, `output=` is the relative path to where you want the script to save the results. This is optional, and if ommitted the results will be saved with the same file / path as the input, but with -done_{timestamp} appended. i.e:
```
node cwv input=example/urls.csv
```

Would output the results to `example/urls-done_2021_05_06_10_00_00.csv`

The script should now run through all the urls specified, output a video for each test in `./videos` and when all the URLs are tested, save the results in the location specified.

#### Options
By default, the script runs network throttled, roughly matching lighthouse mobile test, if you want to run unthrottled, add nothrottle flag:
```
node cwv input=example/input.csv output=example/output.csv nothrottle
```

It also runs with a mobile viewport / user-agent. To run as a desktop:
```
node cwv input=example/input.csv output=example/output.csv desktop nothrottle
```
_(you don't need to add nothrottle, you can run the desktop test throttled by leaving that out)_

##### Traces
You can record a trace of each page load, to use with the [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer) just add the `traces` flag:
```
node cwv input=example/input.csv output=example/output.csv traces
```

These save as `.zip` files in the `/traces` directory, you can view them using Playwright's Trace Viewer:
```
npx playwright show-trace <path to .zip>
```

e.g:
```
npx playwright show-trace traces/httpstamethebots.com_2021-06-09_09_21_20.zip
```

#### The Videos
The video should capture the full test, and will overlay a panel with the CWV. In addition, the LCP element will be outlined with a gold coloured dotted line, and any elements that contributed to the CLS score outlined in a blue dotted line (assuming they didn't get removed or hidden too quickly to see!)

Some sites might set strict CSP policies, in which case, the script injection that powers this will fail. (that will be logged to the console). There is no way around this, and it's rightly the sites choice.

#### The Results .csv
The csv will contain the following columns

* `url` - The URL tested.
* `newCLS` - The CLS score based on the new, session **maximum session window with 1 second gap, capped at 5 seconds.** method.
* `newCLSVerdit` - Poor, Needs Improvement or Good, based on the currently published thresholds, based on the new method.
* `oldCLS` - The CLS score based on the older, total CLS metric.
* `oldCLSVerdit` - Poor, Needs Improvement or Good, based on the currently published thresholds, based on the older method.
* `CLSentries` - An array of any elements that contributed to shift, in JSON format.
* `FID` - The FID score (in Ms).
* `FIDVerdit` - Poor, Needs Improvement or Good, based on the currently published thresholds.
* `LCP` - The LCP score (In Seconds).
* `LCPVerdit` - Poor, Needs Improvement or Good, based on the currently published thresholds.
* `LCPElement` - The Element that was the candidate for LCP.
* `TTFB` - Time to first byte, in Ms.
* `video` - The path to the video screen capture of the test.

## STEAL THIS SCRIPT!!!!
```
{\__/}
( • . •)
/ >💻 u want this?
```

There's plenty that could be changed and improved, like change the input and output to use a database, or a google sheet. Take it, fork it, make it great, I'd love to see what you come up with!