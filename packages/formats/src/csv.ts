/** RFC 4180-ish: quoted fields, `""` escapes, CRLF, newlines inside quotes; a trailing newline adds no row. */
export const parseCsv = (text: string, delimiter = ','): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let touched = false;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    touched = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
      touched = true;
    } else if (c === delimiter) {
      endField();
      touched = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += c;
      touched = true;
    }
  }
  if (touched || field !== '') endRow();
  return rows;
};
