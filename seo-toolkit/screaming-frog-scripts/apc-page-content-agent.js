/**
 * Chromium Page Content Agent (APC) re-implementation — Screaming Frog
 * Custom JavaScript, RENDERED variant.
 *
 * This is a from-scratch rebuild aimed at matching, as closely as a
 * userland script can, what https://dejan.ai/blog/chrome-context-gemini/
 * documents about Chromium's real on-device Page Content Agent: a single
 * node tree walked once over the rendered layout, carrying geometry/text-
 * style/accessibility data and two id systems, with privacy redaction
 * applied during the walk — and FIVE alternative ways to render that same
 * tree (JSON, ID-tagged Markdown, inner text, inner HTML, LLM-sized
 * chunks), not several outputs generated side by side. CONFIG.OUTPUT_MODE
 * below selects exactly one.
 *
 * Every structural decision below is traceable to a quoted sentence from
 * the article (see inline comments). One thing is NOT in the article: the
 * text-size bucket thresholds (the article names the 5 buckets XL/L/M/S/XS
 * but never gives the cutoffs — Chromium's real implementation isn't
 * public).
 *
 * Screaming Frog runs Custom JavaScript as a function body, so the result
 * MUST be returned via `return seoSpider.data(...)` / `return
 * seoSpider.error(...)` — without the `return`, Screaming Frog reports
 * "No data returned" even though the call executed.
 */

const CONFIG = {
  // The article lists 5 things the tree "can be" converted to — plain
  // alternatives, not simultaneous outputs: "Serialized as JSON for direct
  // consumption... Converted to structured Markdown with node ID
  // references... Passed to the inner text builder... Passed to the inner
  // HTML builder... Run through the document chunker...". Pick exactly one.
  OUTPUT_MODE: 'json_tree', // 'json_tree' | 'markdown_with_ids' | 'inner_text' | 'inner_html' | 'chunks'
};

// The 21 node types, quoted verbatim from the article's "Node Types"
// section (heading text before each dash, e.g. "Root — The top-level
// container for the entire page"). No type here was invented; none of the
// article's 21 were dropped. Notably absent: there is no "Button" type —
// the article folds buttons into FormControl ("An interactive input (text
// field, dropdown, button, etc.)").
const NODE_TYPES = [
  'Root', 'Container', 'Text', 'Paragraph', 'Heading', 'Anchor', 'Image',
  'SvgRoot', 'Canvas', 'Video', 'Form', 'FormControl', 'Table', 'TableRow',
  'TableCell', 'OrderedList', 'UnorderedList', 'ListItem', 'Iframe',
  'DialogModal', 'DialogModeless',
];

// "Landmark roles (annotated on container nodes)" — a role field ONLY
// Container nodes carry, separate from node_type. ContentHidden and
// PaidContent are landmark values too, per the article's own list
// (Header, Nav, Search, Main, Article, Section, Aside, Footer,
// ContentHidden, PaidContent), even though they aren't literal HTML
// landmarks — they're flags folded into the same enum.
const LANDMARK_TAG_MAP = {
  header: 'Header', nav: 'Nav', main: 'Main', article: 'Article',
  section: 'Section', aside: 'Aside', footer: 'Footer',
};

// "16 possible reasons" for clickability_reasons, quoted from the
// article's list. Several (":hover CSS pseudo-class", "has mouse
// hover/click events", "has key events") aren't observable from outside
// the page's own JS without instrumenting addEventListener itself, which
// a Custom JavaScript snippet has no hook into after the fact — those are
// left false with a comment rather than guessed at.
const CLICKABILITY_REASON_KEYS = [
  'clickable_control', 'has_click_events', 'has_mouse_hover_events',
  'has_mouse_click_events', 'has_key_events', 'is_editable',
  'has_cursor_pointer_style', 'has_hover_pseudo_class',
  'has_aria_role_implying_clickability', 'has_aria_haspopup',
  'is_aria_toggle', 'is_aria_selectable', 'has_aria_expanded_true',
  'has_aria_expanded_false', 'has_autocomplete', 'has_tabindex',
];

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'head', 'meta', 'link']);

let contentNodeCounter = 0;
let domNodeCounter = 0;
const allNodesFlat = []; // populated during the walk, for size bucketing and JSON output

function collapseWs(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function isRendered(el, style) {
  if (el.hidden) return false;
  if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
  return true;
}

// Screen-reader-only patterns (clip-to-a-point, 1px-and-clipped) aren't in
// the article, but the article's own worked example shows Chrome capturing
// "exactly as rendered" for a sighted user (the WordPress admin-button
// case) — a sr-only node has no visual presence at all, so it's excluded
// from geometry-bearing output the same way a display:none node would be.
function isVisuallyHidden(el, style, rect) {
  if (/rect\(0px,?\s*0px,?\s*0px,?\s*0px\)/.test(style.clip)) return true;
  if (style.clipPath === 'inset(50%)' || style.clipPath === 'circle(0px)') return true;
  if (style.position === 'absolute' && rect.width <= 1 && rect.height <= 1 && style.overflow === 'hidden') return true;
  return false;
}

function isCrossOrigin(el) {
  try {
    const src = el.getAttribute('src');
    if (!src) return false;
    return new URL(src, location.href).origin !== location.origin;
  } catch (e) {
    return true;
  }
}

// "Password redaction — Password field values are never included in the
// output. This covers native password inputs, fields using CSS
// -webkit-text-security to mask characters, and fields that were ever set
// to type 'password' even if later changed to plain text." The "ever set"
// clause needs history across time (a MutationObserver watching for
// type-attribute changes) that a single extraction snapshot can't
// reconstruct after the fact — only the current type and the CSS-masking
// case are checked here; this gap is intentional and documented, not an
// oversight.
function isPasswordField(el) {
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (type === 'password') return true;
  const style = window.getComputedStyle(el);
  if (style.webkitTextSecurity && style.webkitTextSecurity !== 'none') return true;
  return false;
}

// "Paid content detection — Checks for schema.org markup (JSON-LD and
// microdata) indicating content is behind a paywall (isAccessibleForFree:
// false). Paywalled nodes are flagged..." Listed under "Supporting
// Modules", not under Privacy, but applied at the same tree-walk stage per
// "How It All Fits Together". This computes a single page-level flag
// (schema.org paywall markup is normally page-level, not per-node) rather
// than trying to attribute it to specific nodes — the article doesn't
// describe a node-attribution mechanism for this signal.
function detectPaidContentPageLevel() {
  const meta = document.querySelector('[itemprop="isAccessibleForFree"]');
  if (meta) {
    const val = (meta.getAttribute('content') || meta.textContent || '').trim().toLowerCase();
    if (val === 'false') return true;
  }
  const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of ldScripts) {
    try {
      const data = JSON.parse(script.textContent);
      const items = Array.isArray(data) ? data : [data];
      if (items.some((item) => item && (item.isAccessibleForFree === false || item.isAccessibleForFree === 'False'))) {
        return true;
      }
    } catch (e) {
      // malformed JSON-LD, ignore
    }
  }
  return false;
}

// "Each box is defined by x, y, width, height in viewport pixel
// coordinates." Three box kinds: "Outer bounding box... Visible bounding
// box... Fragment bounding boxes... Only present when there are 2+
// fragments."
function getGeometry(el, rect) {
  const outer = {
    x: round(rect.left + window.scrollX), y: round(rect.top + window.scrollY),
    width: round(rect.width), height: round(rect.height),
  };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const visible = {
    x: round(Math.max(rect.left, 0) + window.scrollX),
    y: round(Math.max(rect.top, 0) + window.scrollY),
    width: round(Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0))),
    height: round(Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0))),
  };
  const clientRects = el.getClientRects ? Array.from(el.getClientRects()) : [];
  const fragments = clientRects.length > 1 ? clientRects.map((r) => ({
    x: round(r.left + window.scrollX), y: round(r.top + window.scrollY),
    width: round(r.width), height: round(r.height),
  })) : null;
  const style = window.getComputedStyle(el);
  return { outer, visible, fragments, css_position: style.position };
}

// text_size bucket thresholds (XL/L/M/S/XS) are NOT specified by the
// article — it names the 5 buckets and says they're "relative to the
// page's base font size" but gives no cutoffs, and Chromium's actual
// bucketing logic isn't public. This computes the page's most common
// font-size as the baseline (proxy for "base font size") and buckets every
// other size by its ratio to that baseline. This is an invented heuristic,
// not a verified match to Chromium's behavior.
function buildSizeBucketer() {
  const counts = new Map();
  return {
    observe(px) {
      if (!px) return;
      counts.set(px, (counts.get(px) || 0) + 1);
    },
    finalize() {
      let baseline = 16;
      let max = 0;
      counts.forEach((count, px) => { if (count > max) { max = count; baseline = px; } });
      return (px) => {
        if (!px || !baseline) return 'M';
        const ratio = px / baseline;
        if (ratio >= 2) return 'XL';
        if (ratio >= 1.3) return 'L';
        if (ratio >= 0.85) return 'M';
        if (ratio >= 0.65) return 'S';
        return 'XS';
      };
    },
  };
}

// "Has emphasis (bold, italic, underline, super-/subscript)."
function hasEmphasis(el, style) {
  const weight = parseInt(style.fontWeight, 10) || 400;
  if (weight >= 600) return true;
  if (style.fontStyle === 'italic') return true;
  if (style.textDecorationLine && style.textDecorationLine.includes('underline')) return true;
  if (/^(sup|sub)$/i.test(el.tagName)) return true;
  return false;
}

// "clickability_reasons" — 16 possible reasons, checked individually.
// See CLICKABILITY_REASON_KEYS comment above for the subset that can't be
// observed from a Custom JavaScript snippet (listener-presence reasons);
// those keys are always false here, not omitted, so the shape stays
// consistent with the article's 16-item list.
function getClickabilityReasons(el, style, role) {
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();
  const isNativeClickable = ['a', 'button'].includes(tag)
    || (tag === 'input' && ['button', 'submit', 'reset', 'checkbox', 'radio', 'image'].includes(type))
    || ['select', 'textarea'].includes(tag);
  const isEditable = el.isContentEditable
    || (tag === 'input' && !['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'hidden'].includes(type))
    || tag === 'textarea';
  const clickableAriaRoles = ['button', 'link', 'checkbox', 'radio', 'switch', 'menuitem', 'tab', 'option'];

  return {
    clickable_control: isNativeClickable,
    has_click_events: false, // not observable from outside the page's own listener registrations
    has_mouse_hover_events: false, // not observable
    has_mouse_click_events: false, // not observable
    has_key_events: false, // not observable
    is_editable: isEditable,
    has_cursor_pointer_style: style.cursor === 'pointer',
    has_hover_pseudo_class: false, // :hover match state isn't queryable outside an active hover
    has_aria_role_implying_clickability: clickableAriaRoles.includes(role || ''),
    has_aria_haspopup: el.hasAttribute('aria-haspopup'),
    is_aria_toggle: el.getAttribute('role') === 'switch' || el.hasAttribute('aria-pressed'),
    is_aria_selectable: el.hasAttribute('aria-selected'),
    has_aria_expanded_true: el.getAttribute('aria-expanded') === 'true',
    has_aria_expanded_false: el.getAttribute('aria-expanded') === 'false',
    has_autocomplete: el.hasAttribute('autocomplete'),
    has_tabindex: el.hasAttribute('tabindex'),
  };
}

// "disabled_reasons (aria-disabled, HTML disabled attribute, cursor:not-allowed)."
function getDisabledReasons(el, style) {
  return {
    aria_disabled: el.getAttribute('aria-disabled') === 'true',
    html_disabled_attribute: el.hasAttribute('disabled'),
    cursor_not_allowed: style.cursor === 'not-allowed',
  };
}

// "scroller_info" — only meaningful on nodes that actually scroll.
function getScrollerInfo(el) {
  const scrollable = el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
  if (!scrollable) return null;
  return {
    total_area: round(el.scrollWidth * el.scrollHeight),
    visible_area: round(el.clientWidth * el.clientHeight),
    horizontally_scrollable: el.scrollWidth > el.clientWidth,
    vertically_scrollable: el.scrollHeight > el.clientHeight,
  };
}

// "z_order" — real Chromium compositing order isn't reproducible from
// script; computed z-index (falling back to DOM order, which is what
// actually determines paint order for non-positioned/auto-z-index
// elements) is the closest observable proxy.
function getZOrder(el, style, domOrderIndex) {
  const z = parseInt(style.zIndex, 10);
  return Number.isFinite(z) ? z : domOrderIndex;
}

// classifyNode: fixed-priority tag/attribute matching into exactly one of
// the 21 types. document.body itself is Root; everything else is
// classified by tag first, ARIA role second, and falls through to Text
// (leaf with only inline-formatting children) or Container (everything
// else) last — mirroring the article's own ordering ("Text — A piece of
// visible text content" vs. "Container — A grouping element... that holds
// other nodes").
function classifyNode(el) {
  if (el === document.body) return 'Root';
  const tag = el.tagName.toLowerCase();
  const role = (el.getAttribute('role') || '').toLowerCase();

  if (tag === 'svg') return 'SvgRoot';
  if (tag === 'canvas') return 'Canvas';
  if (tag === 'video') return 'Video';
  if (tag === 'form') return 'Form';
  if (['input', 'select', 'textarea', 'button'].includes(tag)) return 'FormControl';
  if (tag === 'table') return 'Table';
  if (tag === 'tr') return 'TableRow';
  if (tag === 'td' || tag === 'th') return 'TableCell';
  if (tag === 'ol') return 'OrderedList';
  if (tag === 'ul') return 'UnorderedList';
  if (tag === 'li') return 'ListItem';
  if (tag === 'a' && el.hasAttribute('href')) return 'Anchor';
  if (tag === 'img' || tag === 'picture') return 'Image';
  if (tag === 'iframe') return 'Iframe';
  if (/^h[1-6]$/.test(tag)) return 'Heading';
  if (tag === 'p') return 'Paragraph';
  if (role === 'dialog' || role === 'alertdialog') {
    return el.getAttribute('aria-modal') === 'true' ? 'DialogModal' : 'DialogModeless';
  }
  if (isLeafText(el)) return 'Text';
  return 'Container';
}

function isLeafText(el) {
  if (!collapseWs(el.textContent)) return false;
  return [...el.children].every((child) => /^(em|strong|b|i|small|span|br|mark|sub|sup)$/i.test(child.tagName));
}

function getLandmarkRole(el, tag, paidContentDetected) {
  if (el.getAttribute('aria-hidden') === 'true') return 'ContentHidden';
  if (paidContentDetected) return 'PaidContent';
  if (tag === 'nav') return 'Nav';
  if (el.getAttribute('role') === 'search') return 'Search';
  return LANDMARK_TAG_MAP[tag] || null;
}

// dom_node_id allowlist: "A selective ID assigned only to nodes whose
// types appear on an internal allowlist... always [assigned] for
// actionable targets like buttons and links... plus nodes with metadata
// links (focused elements, selections, label references)." Anchor and
// FormControl are the article's own "buttons and links" example;
// TableCell is included because table-cell IDs are the article's own
// worked example later on ("a metrics table with {#294}, {#292}, {#290}").
const DOM_NODE_ID_ALLOWLIST_TYPES = new Set(['Anchor', 'FormControl', 'TableCell']);

function shouldAssignDomNodeId(el, nodeType, hasLabelReference) {
  if (DOM_NODE_ID_ALLOWLIST_TYPES.has(nodeType)) return true;
  if (el.tabIndex >= 0) return true; // focusable
  if (hasLabelReference) return true; // label references this node
  return false;
}

function hasIncomingLabelReference(el) {
  if (!el.id) return false;
  return !!document.querySelector(`[aria-labelledby~="${window.CSS && CSS.escape ? CSS.escape(el.id) : el.id}"], label[for="${window.CSS && CSS.escape ? CSS.escape(el.id) : el.id}"]`);
}

// The article's own FormControl example is "text field, dropdown, button,
// etc." — a single type covering both text-entry fields (labeled by their
// placeholder) AND buttons (labeled by their own visible text/value, which
// buildNode never captured before this fix: a <button>Submit</button> or
// <input type="submit" value="Go">'s node.text stayed empty, since only
// the placeholder attribute was read, and FormControl is a "true leaf"
// that never descends into children to pick the text up that way either).
function getFormControlText(el) {
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (tag === 'button' || (tag === 'input' && ['submit', 'reset', 'button'].includes(type))) {
    // <button>'s label is its textContent (a value attribute is rarely
    // set); <input type="submit/reset/button"> has no children at all, so
    // its label lives in the value attribute instead. An icon-only button
    // (no textContent/value at all) falls back to aria-label — otherwise
    // it gets a dom_node_id (it's in the actionable allowlist) but no
    // label at all, making it unaddressable by anything reading this
    // output, which defeats the point of assigning it an id in the first
    // place ("actionable targets... the AI should be able to target").
    return collapseWs(el.getAttribute('value') || el.textContent) || el.getAttribute('aria-label') || null;
  }
  return el.getAttribute('placeholder') || null;
}

// buildNode: the single tree-walk. Depth-first, so content_node_id is
// assigned in depth-first order per "A sequential number assigned to
// every node via depth-first traversal (1, 2, 3, ...)." Privacy redaction
// (password/cross-origin-iframe) happens here, inline, before this node's
// data is ever handed to a formatter — "Nothing sensitive reaches the
// formatters in the first place."
function buildNode(el, domOrderIndex, sizeBucketer, paidContentDetected) {
  if (SKIP_TAGS.has(el.tagName.toLowerCase())) return null;
  const style = window.getComputedStyle(el);
  if (!isRendered(el, style)) return null;
  const rect = el.getBoundingClientRect();
  if (isVisuallyHidden(el, style, rect)) return null;

  contentNodeCounter += 1;
  const contentNodeId = contentNodeCounter;
  const nodeType = classifyNode(el);
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute('role') || null;

  const geometry = getGeometry(el, rect);
  const fontSizePx = parseFloat(style.fontSize) || null;
  if (sizeBucketer && fontSizePx) sizeBucketer.observe(fontSizePx);

  const hasLabelRef = hasIncomingLabelReference(el);
  let domNodeId = null;
  if (shouldAssignDomNodeId(el, nodeType, hasLabelRef)) {
    domNodeCounter += 1;
    domNodeId = domNodeCounter;
    el.setAttribute('data-apc-id', String(domNodeId));
  }

  const node = {
    content_node_id: contentNodeId,
    dom_node_id: domNodeId,
    node_type: nodeType,
    tag,
    // Heading level (1-6) is carried separately from node_type, since the
    // article's enum has one "Heading" type covering h1-h6 with no
    // sub-distinction — this is needed by formatAsMarkdownWithIds to pick
    // the right number of '#' and isn't part of the article's own schema.
    heading_level: /^h[1-6]$/.test(tag) ? Number(tag[1]) : null,
    text: null, // filled in below for text-bearing leaf types
    geometry,
    text_style: {
      // resolved to a bucket string in a post-pass, once the page's
      // baseline size is known — see finalizeSizeBuckets()
      font_size_px: fontSizePx,
      text_size: null,
      has_emphasis: hasEmphasis(el, style),
      color: style.color,
    },
    accessibility: {
      is_focusable: el.tabIndex >= 0,
      is_tabbable: el.tabIndex === 0,
      is_disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      clickability_reasons: getClickabilityReasons(el, style, role),
      disabled_reasons: getDisabledReasons(el, style),
      z_order: getZOrder(el, style, domOrderIndex),
      scroller_info: getScrollerInfo(el),
    },
    landmark_role: nodeType === 'Container' ? getLandmarkRole(el, tag, paidContentDetected) : null,
    aria_label: el.getAttribute('aria-label') || null,
    aria_labelledby: el.getAttribute('aria-labelledby') || null,
    redacted: false,
    children: [],
  };

  // Password redaction: value never included, node kept in the tree
  // (position/type still matter for layout fidelity) but text redacted.
  if (nodeType === 'FormControl' && isPasswordField(el)) {
    node.text = '[REDACTED]';
    node.redacted = true;
    allNodesFlat.push(node);
    return node; // do not descend — nothing below a password field matters
  }

  // Cross-origin iframe redaction: "content is replaced with redacted
  // metadata (just the origin). Only same-origin iframes have their
  // content included."
  if (nodeType === 'Iframe') {
    if (isCrossOrigin(el)) {
      node.text = null;
      node.redacted = true;
      node.iframe_origin = (() => { try { return new URL(el.getAttribute('src'), location.href).origin; } catch (e) { return null; } })();
      allNodesFlat.push(node);
      return node;
    }
    try {
      const innerDoc = el.contentDocument;
      if (innerDoc && innerDoc.body) {
        const innerChild = buildNode(innerDoc.body, 0, sizeBucketer, paidContentDetected);
        if (innerChild) node.children.push(innerChild);
      }
    } catch (e) {
      // sandboxed/unloaded — leave children empty rather than throw
    }
    allNodesFlat.push(node);
    return node;
  }

  if (nodeType === 'Image') {
    node.text = el.getAttribute('alt') || null;
  } else if (nodeType === 'FormControl') {
    node.text = getFormControlText(el);
  } else if (['Text', 'Heading', 'Paragraph', 'Anchor', 'TableCell', 'ListItem', 'Container', 'DialogModal', 'DialogModeless'].includes(nodeType)) {
    // ListItem/Container/DialogModal/DialogModeless are added here so a
    // node with NO element children at all (<li>Step One</li>, a <div>
    // holding only bare text) still carries its text somewhere — the
    // mixed-content childNodes walk below is skipped entirely when
    // hasElementChild is false, so without this fallback capture, text-
    // only content in one of these wrapper types would silently vanish.
    // For nodes that DO have element children, this text is redundant
    // with what the children capture (and is overridden as a rendering
    // source by formatAsMarkdownWithIds's childText-first logic) — it
    // only matters as the sole source of truth in the no-children case.
    node.text = collapseWs(el.textContent).slice(0, 2000) || null;
  }

  allNodesFlat.push(node);

  // TRUE leaves: types that can never meaningfully contain a nested
  // actionable child worth its own node (an <a> or <input> inside another
  // <a>/<input> is invalid markup browsers reparent anyway; SvgRoot/
  // Canvas/Video/Image have no element children in the article's model).
  // 'Text' is here because isLeafText() already required its children be
  // pure inline-formatting tags (em/strong/etc.), never a/button/img.
  //
  // Heading and Paragraph were WRONGLY in this list in an earlier version
  // of this rewrite: a <p>Intro <a href="/x">link text</a></p> has its
  // link swallowed into the paragraph's own textContent and never gets a
  // node/dom_node_id of its own — exactly the "actionable elements the AI
  // should be able to target" the article's dom_node_id system exists for.
  // They still capture their OWN collapsed text above (used as a fallback
  // label if no actionable descendant exists), but always descend so any
  // nested Anchor/Image/FormControl still gets its own tree node.
  if (['Anchor', 'FormControl', 'Image', 'SvgRoot', 'Canvas', 'Video', 'Text'].includes(nodeType)) {
    return node;
  }

  // Only walk el.childNodes (text nodes included) when el has at least one
  // ELEMENT child — i.e. genuinely mixed content like
  // <p>Intro <a href="/x">link text</a></p>. A purely textual element
  // (<h2>Heading One</h2>, no element children at all) instead just keeps
  // its text in node.text above and children stays empty: the article's
  // own worked example renders a heading's text inline with the heading
  // itself ("# {#458} DEJAN is an AI SEO agency...", no separate Text node
  // shown), and duplicating that same text into a redundant synthetic Text
  // child added a second copy of it to the tree for no benefit — every
  // formatter would either have to know to skip node.text in favor of the
  // child, or double-render the same words.
  //
  // The mixed-content case does need the text-node walk: a paragraph's
  // loose text around a link was, before this fix, captured ONLY inside
  // the paragraph's own collapsed textContent (node.text) — any formatter
  // rendering children instead of that fallback lost "Intro " entirely,
  // since there was no Text child node carrying it once the link itself
  // got pulled out into its own Anchor child.
  const hasElementChild = Array.from(el.children).length > 0;
  if (hasElementChild) {
    let childIndex = 0;
    for (const child of el.childNodes) {
      let childNode;
      if (child.nodeType === Node.TEXT_NODE) {
        const text = collapseWs(child.nodeValue);
        childNode = text ? makeTextNode(text) : null;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        childNode = buildNode(child, childIndex, sizeBucketer, paidContentDetected);
        childIndex += 1;
      }
      if (childNode) node.children.push(childNode);
    }
  }
  return node;
}

// A standalone Text node for a direct text-node child (see buildNode's
// comment above). Gets its own content_node_id like any other node ("every
// node gets one" — the article's content_node_id definition doesn't carve
// out an exception for bare text), but never a dom_node_id: plain text is
// never one of the article's "actionable targets like buttons and links",
// and it can't be focused or label-referenced either.
function makeTextNode(text) {
  contentNodeCounter += 1;
  const node = {
    content_node_id: contentNodeCounter,
    dom_node_id: null,
    node_type: 'Text',
    tag: '#text',
    heading_level: null,
    text,
    geometry: null,
    text_style: { font_size_px: null, text_size: null, has_emphasis: false, color: null },
    accessibility: { is_focusable: false, is_tabbable: false, is_disabled: false, clickability_reasons: null, disabled_reasons: null, z_order: null, scroller_info: null },
    landmark_role: null,
    aria_label: null,
    aria_labelledby: null,
    redacted: false,
    children: [],
  };
  allNodesFlat.push(node);
  return node;
}

// Post-pass: resolve every node's font_size_px into a text_size bucket
// now that the page-wide baseline is known (buildNode runs before the
// baseline can be finalized, since it IS what establishes the baseline).
function finalizeSizeBuckets(root, bucketFn) {
  function visit(node) {
    node.text_style.text_size = bucketFn(node.text_style.font_size_px);
    node.children.forEach(visit);
  }
  visit(root);
}

// ---- Formatters: 5 alternative renderings of the SAME tree ----
// "Once the Page Content Agent builds the node tree, three formatters can
// convert it into different output formats" + the 2 earlier-listed
// options (JSON, ID-tagged Markdown) from "How It All Fits Together" = 5
// total alternatives. Only CONFIG.OUTPUT_MODE's chosen one runs.

function formatAsJsonTree(root) {
  return root; // caller JSON.stringifies
}

// "Converted to structured Markdown with node ID references, enabling the
// AI to target specific elements on the page." The article's own example
// format is `{#id}` after the element's text, e.g. "# {#458} DEJAN is an
// AI SEO agency..." — headings carry the tag BEFORE the id in that
// example, unlike a trailing-only convention; this follows that ordering.
//
// Three CommonMark-validity fixes carried over from prior verification
// against a real Markdown parser (markdown-it), none specified by the
// article but required for the output to actually render as intended:
//   1. A text node's raw textContent (only used as a last-resort label
//      fallback below) can include source-formatting whitespace with
//      embedded newlines; normalizeText() collapses those to spaces so
//      they can't be mistaken for the deliberate '\n's this function
//      itself emits.
//   2. Two adjacent lists/tables of the SAME kind merge into one under
//      CommonMark unless given a full blank line AND (for same-type
//      siblings) an alternating marker — OrderedList/UnorderedList/Table
//      each open a fresh marker/blank-line scope.
//   3. A literal '|' in cell text must be escaped or it's indistinguishable
//      from the column delimiter.
function formatAsMarkdownWithIds(root) {
  let ulToggle = 0;
  let olToggle = 0;

  function normalizeText(str) {
    return (str || '').replace(/\s+/g, ' ').trim();
  }
  // Always shows content_node_id, never dom_node_id — the two are
  // independent counters (content_node_id counts every node via DFS;
  // dom_node_id is a separate, much smaller counter that only advances
  // for allowlisted actionable nodes). Mixing them here previously caused
  // real collisions: a Heading with no dom_node_id fell back to
  // content_node_id=37, while an unrelated Anchor elsewhere had
  // dom_node_id=37 — both then rendered as the identical "{#37}" tag. In
  // real Chromium, dom_node_id is a large Blink-internal id from a wholly
  // separate numbering space that never collides with content_node_id;
  // that mechanism isn't reachable from a page-context Custom JavaScript
  // snippet (it's exposed only via the Chrome DevTools Protocol), so this
  // script approximates it with its own counter — and any such counter
  // will eventually overlap content_node_id's range unless the tag always
  // draws from ONE id space. content_node_id is that one space: every
  // node has exactly one, uniquely, by construction.
  function idTag(node) {
    return node.content_node_id ? ` {#${node.content_node_id}}` : '';
  }
  // Anchor/FormControl/Image text can be empty if the element's only
  // content is a nested <img alt="...">, since buildNode only reads
  // el.textContent for those types — this falls back to a descendant
  // Image node's alt text (rendered by render(child) already), same fix
  // as the previous iteration's insideInteractive/img-alt handling.
  function labelFor(node) {
    if (node.text) return normalizeText(node.text);
    const childRendered = node.children.map(render).filter(Boolean).join(' ');
    const stripped = childRendered.replace(/\{#\d+\}/g, '').replace(/[\[\]"]/g, '').trim();
    return normalizeText(stripped);
  }

  function render(node) {
    if (node.redacted) {
      return node.node_type === 'FormControl' ? '[Input: password (REDACTED)]' : `[Iframe: ${node.iframe_origin || 'cross-origin'}, content hidden]`;
    }
    const childText = node.children.map(render).filter(Boolean).join(' ');

    switch (node.node_type) {
      // Heading/Paragraph descend into real children now (see buildNode's
      // comment on why they were wrongly treated as leaves before), so an
      // <a>/<img> inside gets its OWN [Link:.../Image:...] tag rendered by
      // the recursion — using node.text here (buildNode's flat
      // el.textContent capture) instead of childText would duplicate that
      // link's words as plain text AND silently drop its {#id} tag/label
      // entirely, since childText already contains the fully-tagged
      // rendering. node.text is only a fallback for the rare case of zero
      // renderable children (e.g. every child was redacted/hidden).
      case 'Heading': {
        const label = childText || labelFor(node);
        if (!label) return '';
        const level = node.heading_level || 2;
        return `\n${'#'.repeat(level)} ${label}${idTag(node)}\n`;
      }
      case 'Paragraph': {
        const label = childText || labelFor(node);
        return label ? `\n${label}${idTag(node)}\n` : '';
      }
      case 'Anchor': {
        const label = labelFor(node);
        return label ? `[Link: "${label}"]${idTag(node)}` : '';
      }
      case 'FormControl': {
        const label = node.text || labelFor(node);
        return `[Input: "${label}"]${idTag(node)}`;
      }
      case 'Image':
        return node.text ? `[Image: "${normalizeText(node.text)}"]${idTag(node)}` : '';
      case 'TableCell': {
        const label = labelFor(node) || ' ';
        return `${label.replace(/\|/g, '\\|')}${idTag(node)}`;
      }
      case 'TableRow': {
        const cells = node.children.map(render);
        if (!cells.some(Boolean)) return '';
        return `| ${cells.join(' | ')} |\n`;
      }
      case 'Table': {
        if (!childText) return '';
        // Insert a '| --- |' separator after the first row so the table
        // is valid GFM-table syntax (a header-then-separator pair), per
        // the earlier session's markdown-it verification.
        const lines = childText.split('\n').filter(Boolean);
        const colCount = (lines[0] || '').split('|').length - 2;
        const separator = colCount > 0 ? `| ${Array(colCount).fill('---').join(' | ')} |` : '';
        const withSeparator = separator ? [lines[0], separator, ...lines.slice(1)].join('\n') : childText;
        return `\n\n${withSeparator}\n\n`;
      }
      // ListItem has no case of its own: OrderedList/UnorderedList below
      // render each child <li>'s content directly so they can apply their
      // own marker/numbering — a standalone ListItem render would need to
      // know its parent's marker choice, which render()'s single-node
      // signature doesn't carry.
      //
      // Deliberately calls render(li) (FULLY formatted — [Link: "..."]
      // tags and all), not labelFor(li) — labelFor() exists to produce a
      // plain-text FALLBACK label (used when e.g. an Anchor/Image has no
      // text of its own and needs a stand-in), and its cleanup regex
      // strips exactly the '[', ']', '"' and '{#id}' punctuation that a
      // properly rendered link/image tag is made of. Using it here turned
      // '[Link: "Link A1"] {#1}' into a mangled 'Link: Link A1' with the
      // id silently dropped.
      case 'OrderedList':
      case 'UnorderedList': {
        if (!node.children.length) return '';
        const isOrdered = node.node_type === 'OrderedList';
        const marker = isOrdered
          ? ((olToggle++ % 2 === 0) ? '.' : ')')
          : ((ulToggle++ % 2 === 0) ? '*' : '-');
        const itemLines = node.children.map((li, i) => {
          const content = render(li) || labelFor(li);
          if (!content) return '';
          return isOrdered ? `${i + 1}${marker} ${content}\n` : `${marker} ${content}\n`;
        }).filter(Boolean).join('');
        return itemLines ? `\n\n${itemLines}\n\n` : '';
      }
      case 'Text':
        return normalizeText(node.text);
      default:
        return childText;
    }
  }
  return render(root).replace(/\n{3,}/g, '\n\n').trim();
}

// "Inner Text Builder — Takes the node tree and flattens it into plain
// text." / "All structure is lost, just the readable words remain."
function formatAsInnerText(root) {
  const parts = [];
  function visit(node) {
    if (node.redacted) return;
    // node.text and node.children can both carry the SAME words — a
    // Paragraph's node.text is its full collapsed textContent (set as a
    // fallback for the no-element-children case; see buildNode's
    // comment), while its children include a Text node for "Some text
    // with a" AND an Anchor node for "link" that together spell out that
    // same sentence. Visiting both pushed every word twice. Preferring
    // children when present (matching formatAsMarkdownWithIds's
    // childText-first logic) and falling back to node.text only when
    // there are no children keeps each word contributed exactly once.
    if (node.children.length) {
      node.children.forEach(visit);
    } else if (node.text) {
      parts.push(node.text);
    }
  }
  visit(root);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// "Inner HTML Builder — Takes the node tree and produces cleaned-up HTML."
// / "stripped of scripts, styles, and noise." Rebuilds markup FROM the
// tree (not from the live DOM), so anything the tree already excluded
// (script/style, redacted fields/frames, hidden nodes) can't reappear.
const TAG_FOR_TYPE = {
  Heading: 'h2', Paragraph: 'p', Anchor: 'a', Image: 'img', Table: 'table',
  TableRow: 'tr', TableCell: 'td', OrderedList: 'ol', UnorderedList: 'ul',
  ListItem: 'li', Form: 'form', FormControl: 'input',
};
function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function formatAsInnerHtml(root) {
  function render(node) {
    if (node.redacted) return '';
    const childHtml = node.children.map(render).join('');
    // TableCell keeps its original tag (th vs. td) instead of the
    // TAG_FOR_TYPE table's fixed 'td' — the article's TableCell type
    // doesn't distinguish header/data cells, but collapsing every <th>
    // into <td> loses real semantic information the source HTML had, for
    // no reason tied to the article's schema.
    const tag = node.node_type === 'TableCell' ? node.tag : TAG_FOR_TYPE[node.node_type];
    if (!tag) return childHtml; // Root/Container/Text/etc. pass through
    if (node.node_type === 'Image') return `<img alt="${escapeHtml(node.text)}">`;
    if (node.node_type === 'FormControl') {
      // A button's text is its content, not an attribute — mirrors
      // getFormControlText()'s tag/type split.
      return node.tag === 'button'
        ? `<button>${escapeHtml(node.text)}</button>`
        : `<input placeholder="${escapeHtml(node.text)}">`;
    }
    // Same duplication risk as formatAsInnerText: prefer childHtml when
    // there are real children (already contains this node's words, via
    // its own Text/Anchor/etc. descendants), fall back to node.text only
    // when there's nothing underneath to render.
    const text = childHtml || escapeHtml(node.text || '');
    return `<${tag}>${text}</${tag}>`;
  }
  return render(root);
}

// "Document Chunker — Splits the extracted text into passage-sized chunks
// suitable for feeding into an LLM context window... Handles splitting at
// sentence and paragraph boundaries so chunks don't break mid-thought."
// No word-count or passage-count cap: an earlier version aggregated words
// up to an invented MAX_CHUNK_WORDS/MAX_PASSAGES pair presented as real
// Chromium constants — verified against the actual Chromium source and
// only MAX_CHUNK_WORDS's underlying number turned out to be real, and it
// belongs to an unrelated feature (history embeddings), not APC's own
// document chunker. Chunking at the tree's own paragraph/heading/list-
// item/cell boundaries instead achieves the same "don't break mid-
// thought" goal without any invented numeric limit — each block-level
// node becomes exactly one passage, however long or short it is.
function formatAsChunks(root) {
  const chunks = [];
  function visit(node) {
    if (node.redacted) return;
    if (['Heading', 'Paragraph', 'ListItem', 'TableCell'].includes(node.node_type)) {
      const text = formatAsInnerText(node);
      if (text) chunks.push(text);
      return;
    }
    node.children.forEach(visit);
  }
  visit(root);
  return chunks.map((text, i) => ({ passage_id: i + 1, text }));
}

try {
  domNodeCounter = 0;
  contentNodeCounter = 0;
  allNodesFlat.length = 0;

  const paidContentDetected = detectPaidContentPageLevel();
  const sizeBucketer = buildSizeBucketer();
  const tree = buildNode(document.body, 0, sizeBucketer, paidContentDetected);
  const bucketFn = sizeBucketer.finalize();
  finalizeSizeBuckets(tree, bucketFn);

  let output;

  switch (CONFIG.OUTPUT_MODE) {
    case 'inner_text':
      output = formatAsInnerText(tree);
      break;
    case 'inner_html':
      output = formatAsInnerHtml(tree);
      break;
    case 'chunks':
      output = JSON.stringify(formatAsChunks(tree));
      break;
    case 'markdown_with_ids':
      output = formatAsMarkdownWithIds(tree);
      break;
    case 'json_tree':
    default:
      output = JSON.stringify(formatAsJsonTree(tree));
      break;
  }

  const result = {
    url: location.href,
    title: document.title,
    output_mode: CONFIG.OUTPUT_MODE,
    node_type_count: NODE_TYPES.length,
    content_node_count: contentNodeCounter,
    dom_node_count: domNodeCounter,
    paid_content_detected: paidContentDetected,
    output,
  };

  return seoSpider.data(result);
} catch (err) {
  return seoSpider.error(`APC extraction failed: ${err && err.message ? err.message : String(err)}`);
}
