/* 
   Extracts meta, h1 and <article> to markdown
   Based on https://www.screamingfrog.co.uk/blog/generate-markdown-at-scale/
*/

function loadTurndown() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/turndown/dist/turndown.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Turndown.js'));
        document.head.appendChild(script);
    });
}

function extractContent() {
    const title = document.title || '';

    const metaDescEl = document.querySelector('meta[name="description"]');
    const description = metaDescEl ? (metaDescEl.getAttribute('content') || '') : '';

    const h1El = document.querySelector('h1');
    const h1 = h1El ? h1El.textContent.trim() : '';

    const articleEl = document.querySelector('article');
    let articleContent = 'No <article> element found';

    if (articleEl) {
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-'
        });

        turndownService.addRule('cleanImages', {
            filter: 'img',
            replacement: function(content, node) {
                const alt = node.getAttribute('alt') || '';
                const src = node.getAttribute('src') || '';
                if (!alt.trim()) return '';
                return '![' + alt + '](' + src + ')';
            }
        });

        turndownService.addRule('removeEmptyLinks', {
            filter: function(node) {
                return node.nodeName === 'A' && !node.textContent.trim();
            },
            replacement: function() { return ''; }
        });

        articleContent = turndownService.turndown(articleEl.innerHTML)
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    const output = [
        '---',
        'title: "'       + title.replace(/"/g, '\\"')       + '"',
        'description: "' + description.replace(/"/g, '\\"') + '"',
        'h1: "'          + h1.replace(/"/g, '\\"')          + '"',
        '---',
        '',
        articleContent
    ].join('\n');

    return output;
}

return loadTurndown()
    .then(() => seoSpider.data(extractContent()))
    .catch(error => seoSpider.error(error));
