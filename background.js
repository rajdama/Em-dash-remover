chrome.commands.onCommand.addListener((command) => {
  if (command !== 'clear-emdash') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { action: 'clear-emdash' }).catch(() => {});
  });
});
