/** Hands `data` to the browser as a file download and frees the object URL right away. */
export function downloadBlob(name: string, data: Blob): void {
  const url = URL.createObjectURL(data);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The BOM is part of the CSV text, so it is kept as the first bytes of the file. */
export const csvBlob = (text: string): Blob => new Blob([text], { type: 'text/csv;charset=utf-8' });
