export type ArticleData = { title: string; url: string; text: string };

export function extractArticle(doc: Document = document): ArticleData {
  const title = doc.title;
  const canonical = (doc.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href;
  const url = canonical ?? '';
  const text = doc.body?.innerText?.trim() ?? '';
  return { title, url, text };
}
