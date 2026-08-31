/** Pembersih & render jawaban AI: teks polos + tabel sungguhan. */

/** Bersihkan sisa markdown agar teks mudah dibaca (bintang, header, backtick). */
export function cleanAnswer(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/^#{1,6}\s*/gm, "");
}

interface TableBlock {
  type: "table";
  headers: string[];
  rows: string[][];
}

interface TextBlock {
  type: "text";
  text: string;
}

const SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function isPipeRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 2;
}

function parseRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

/** Pisahkan jawaban menjadi blok teks polos dan blok tabel (format | kolom |). */
function parseBlocks(text: string): (TextBlock | TableBlock)[] {
  const lines = text.split("\n");
  const blocks: (TextBlock | TableBlock)[] = [];
  let textBuf: string[] = [];
  let i = 0;

  const flushText = () => {
    if (textBuf.length > 0) {
      blocks.push({ type: "text", text: textBuf.join("\n") });
      textBuf = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    if (isPipeRow(line) && i + 1 < lines.length && SEP_RE.test(lines[i + 1])) {
      flushText();
      const headers = parseRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isPipeRow(lines[i])) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
    } else {
      textBuf.push(line);
      i++;
    }
  }
  flushText();
  return blocks;
}

export function AnswerContent({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <>
      {blocks.map((b, i) =>
        b.type === "table" ? (
          <div key={i} className="my-1 overflow-x-auto">
            <table className="w-full border-collapse text-[12px] leading-tight">
              <thead>
                <tr>
                  {b.headers.map((h, j) => (
                    <th
                      key={j}
                      className="whitespace-nowrap border border-border bg-foreground/10 px-2 py-1 text-left font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, k) => (
                  <tr key={k}>
                    {r.map((c, j) => (
                      <td key={j} className="whitespace-nowrap border border-border px-2 py-1">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div key={i} className="whitespace-pre-wrap">
            {b.text}
          </div>
        )
      )}
    </>
  );
}