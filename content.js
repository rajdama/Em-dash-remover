(() => {
  const TRIGGERS = ['/clear-emdash', '/clear-em', '/noem'];
  const DEFAULTS = {
    replacement: 'remove',
    includeEnDash: false,
    autoReplace: false,
    showToast: true,
  };

  let settings = { ...DEFAULTS };

  if (chrome?.storage?.sync) {
    chrome.storage.sync.get(DEFAULTS, (data) => {
      settings = { ...DEFAULTS, ...data };
    });
    chrome.storage.onChanged.addListener((changes) => {
      for (const key in changes) settings[key] = changes[key].newValue;
    });
  }

  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Trigger must be followed by whitespace (space / tab / newline). This prevents
  // the trigger from firing while the user is mid-typing a longer command (e.g.
  // /clear-em firing inside /clear-emdash) and lets them backspace freely.
  const TRIGGER_SOURCE = '\\s*(?:' + TRIGGERS.map(escapeRegExp).join('|') + ')\\s+';
  const TRIGGER_RE_G = new RegExp(TRIGGER_SOURCE, 'g');
  const TRIGGER_RE = new RegExp(TRIGGER_SOURCE);
  const HAS_TRIGGER_RE = new RegExp(
    '(?:' + TRIGGERS.map(escapeRegExp).join('|') + ')\\s',
  );

  function dashPattern() {
    return settings.includeEnDash ? '[—–]' : '—';
  }

  // Returns { regex, replacement } pair for em dashes based on current settings.
  // Used both for plain-text cleaning (input/textarea) and granular contenteditable
  // replacement (where we re-run the regex per text-node).
  function dashRule({ global = true } = {}) {
    const dc = dashPattern();
    const flags = global ? 'g' : '';
    switch (settings.replacement) {
      case 'remove':  return { regex: new RegExp(`[ \\t]*${dc}[ \\t]*`, flags), replacement: ' ' };
      case 'comma':   return { regex: new RegExp(`[ \\t]*${dc}[ \\t]*`, flags), replacement: ', ' };
      case 'spaced':  return { regex: new RegExp(`[ \\t]*${dc}[ \\t]*`, flags), replacement: ' - ' };
      case 'hyphen':  return { regex: new RegExp(dc, flags), replacement: '-' };
      default:        return { regex: new RegExp(dc, flags), replacement: '' };
    }
  }

  function clean(text, { stripTrigger = false } = {}) {
    if (!text) return text;
    const { regex, replacement } = dashRule({ global: true });
    let out = text.replace(regex, replacement);
    if (stripTrigger) out = out.replace(TRIGGER_RE_G, ' ').replace(/^ +| +$/g, '');
    return out;
  }

  function isEditableInput(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return !el.disabled && !el.readOnly;
    if (el.tagName === 'INPUT') {
      const t = (el.type || 'text').toLowerCase();
      return !el.disabled && !el.readOnly &&
        ['text', 'search', 'url', 'email', 'tel', 'password', ''].includes(t);
    }
    return false;
  }

  // Find the first match of `pattern` (non-global) anywhere in the visible
  // text under `root`, returning { node, start, end } pointing into a single
  // text node, or null. Crossing-text-node matches are not supported — adequate
  // for our use (em dash + adjacent spaces almost always live in one text node).
  function findFirstTextMatch(root, pattern) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      if (!text) continue;
      const m = text.match(pattern);
      if (m) {
        return { node, start: m.index, end: m.index + m[0].length };
      }
    }
    return null;
  }

  function replaceRangeViaInsertText(node, start, end, replacement) {
    const sel = window.getSelection();
    if (!sel || !node || !node.parentNode) return false;
    const range = document.createRange();
    try {
      range.setStart(node, start);
      range.setEnd(node, end);
    } catch (_) {
      return false;
    }
    sel.removeAllRanges();
    sel.addRange(range);
    try {
      return !!document.execCommand('insertText', false, replacement);
    } catch (_) {
      return false;
    }
  }

  // Replace every occurrence of `pattern` under `root` with `replacement`,
  // one execCommand call at a time. This keeps the disturbance to framework
  // editors (ProseMirror, Lexical, Slate) minimal — each call is a normal
  // small-range insertText that the editor understands and re-syncs from.
  function replaceAllInContentEditable(root, pattern, replacement) {
    let changed = false;
    let safety = 5000; // hard cap against pathological input
    while (safety-- > 0) {
      const m = findFirstTextMatch(root, pattern);
      if (!m) break;
      const ok = replaceRangeViaInsertText(m.node, m.start, m.end, replacement);
      if (!ok) break;
      changed = true;
    }
    return changed;
  }

  function processField(el, { stripTrigger = false } = {}) {
    if (!el) return false;

    if (el.isContentEditable) {
      try { el.focus(); } catch (_) {}

      let changed = false;
      if (stripTrigger) {
        if (replaceAllInContentEditable(el, TRIGGER_RE, ' ')) changed = true;
      }
      const { regex, replacement } = dashRule({ global: false });
      if (replaceAllInContentEditable(el, regex, replacement)) changed = true;
      return changed;
    }

    if (isEditableInput(el)) {
      const text = el.value;
      const cleaned = clean(text, { stripTrigger });
      if (text === cleaned) return false;

      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, cleaned);
      else el.value = cleaned;

      try {
        const pos = cleaned.length;
        el.setSelectionRange(pos, pos);
      } catch (_) {}

      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  function getFocusedEditable() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    if (!el) return null;
    if (el.isContentEditable) return el;
    if (isEditableInput(el)) return el;
    return null;
  }

  let toastEl = null;
  let toastTimer = null;
  function showToast(msg) {
    if (!settings.showToast) return;
    if (!document.body) return;
    if (toastEl) {
      clearTimeout(toastTimer);
      toastEl.remove();
    }
    toastEl = document.createElement('div');
    toastEl.textContent = msg;
    Object.assign(toastEl.style, {
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#1f1f1f',
      color: '#fff',
      padding: '8px 14px',
      borderRadius: '6px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '13px',
      lineHeight: '1',
      zIndex: '2147483647',
      opacity: '0',
      transition: 'opacity .15s ease',
      boxShadow: '0 6px 18px rgba(0,0,0,.25)',
      pointerEvents: 'none',
    });
    document.body.appendChild(toastEl);
    requestAnimationFrame(() => {
      if (toastEl) toastEl.style.opacity = '1';
    });
    toastTimer = setTimeout(() => {
      if (!toastEl) return;
      toastEl.style.opacity = '0';
      setTimeout(() => { toastEl?.remove(); toastEl = null; }, 200);
    }, 1100);
  }

  function getCurrentText(el) {
    if (!el) return '';
    if (el.isContentEditable) return el.innerText || '';
    if ('value' in el) return el.value || '';
    return '';
  }

  function hasTrigger(text) {
    if (!text) return false;
    return HAS_TRIGGER_RE.test(text);
  }

  // Re-entrance guard: our own execCommand calls fire input events, and we don't
  // want to recursively process them. Also acts as a per-element debounce so we
  // don't pile up scheduled tasks while the user types.
  const scheduled = new WeakSet();
  let processing = false;

  function scheduleProcess(el) {
    if (processing) return;
    if (scheduled.has(el)) return;
    scheduled.add(el);
    // Defer past the framework's own input handler so we don't mutate the DOM
    // while ProseMirror / Lexical / Slate is still reconciling state.
    setTimeout(() => {
      scheduled.delete(el);
      const text = getCurrentText(el);
      const hasTrig = hasTrigger(text);
      if (!hasTrig && !settings.autoReplace) return;
      processing = true;
      try {
        const changed = processField(el, { stripTrigger: hasTrig });
        if (changed && hasTrig) showToast('Em dashes cleared');
      } finally {
        processing = false;
      }
    }, 0);
  }

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el) return;
    if (!el.isContentEditable && !isEditableInput(el)) return;
    scheduleProcess(el);
  }, true);

  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.action === 'clear-emdash') {
        const el = getFocusedEditable();
        const changed = processField(el, { stripTrigger: true });
        if (changed) showToast('Em dashes cleared');
        else if (el) showToast('No em dashes here');
        else showToast('Click into an input first');
        sendResponse?.({ ok: true, changed });
      }
    });
  }
})();
