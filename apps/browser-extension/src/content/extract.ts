export interface Article {
  title: string;
  url: string;
  text: string;
}

export function extractArticle(doc?: Document): Article {
  const document = doc || globalThis.document;

  // Extract title
  const title = document.title || '';

  // Extract canonical URL
  let url = '';
  const canonicalLink = document.querySelector('link[rel="canonical"]');
  if (canonicalLink && canonicalLink.hasAttribute('href')) {
    url = canonicalLink.getAttribute('href') || '';
  }

  // Extract and trim body text
  let text = '';
  if (document.body) {
    text = document.body.innerText?.trim() || '';
  }

  return { title, url, text };
}
