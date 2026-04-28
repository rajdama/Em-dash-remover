const DEFAULTS = {
  replacement: 'remove',
  includeEnDash: false,
  autoReplace: false,
  showToast: true,
};

const $ = (s) => document.querySelector(s);

chrome.storage.sync.get(DEFAULTS, (data) => {
  const r = document.querySelector(`input[name="replacement"][value="${data.replacement}"]`);
  if (r) r.checked = true;
  $('#includeEnDash').checked = !!data.includeEnDash;
  $('#autoReplace').checked = !!data.autoReplace;
  $('#showToast').checked = !!data.showToast;
});

document.querySelectorAll('input[name="replacement"]').forEach((r) => {
  r.addEventListener('change', () => {
    if (r.checked) chrome.storage.sync.set({ replacement: r.value });
  });
});

const bindToggle = (id) => {
  $(`#${id}`).addEventListener('change', (e) => {
    chrome.storage.sync.set({ [id]: e.target.checked });
  });
};

bindToggle('includeEnDash');
bindToggle('autoReplace');
bindToggle('showToast');
