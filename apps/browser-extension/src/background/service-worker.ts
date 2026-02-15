import { type Message } from '../types';

console.log('LifeOS Extension: Background script loaded');

// Initialize Context Menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lifosy-save-knowledge',
    title: 'Add to Knowledge Base',
    contexts: ['selection'],
  });
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'lifosy-save-knowledge' && info.selectionText) {
    saveToKnowledgeBase(info.selectionText, tab?.url || '', tab?.title || '');
  }
});

// Message Handling
chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === 'AUTH_TOKEN_UPDATE' && message.token) {
    console.log('LifeOS Extension: Received token update');
    chrome.storage.local.set({ lifeos_token: message.token }, () => {
      console.log('LifeOS Extension: Token saved');
    });
  }
});

async function saveToKnowledgeBase(text: string, url: string, pageTitle: string) {
  const tokenData = await chrome.storage.local.get('lifeos_token');
  const token = tokenData.lifeos_token;

  if (!token) {
    console.warn('LifeOS Extension: No auth token found. Please login to Console.');
    // Ideally show a notification
    return;
  }

  // Placeholder for actual API call
  console.log('LifeOS Extension: Mock saving to knowledge base', { text, url, pageTitle });
  // In a real implementation:
  // fetch('https://api.github.com/repos/lifosy/monorepo/contents/knowledge/clippings.md', ...)
}
