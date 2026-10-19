/** PostgREST caps a response; a long quiz history must not hide recent days. */
export async function readLearningHistory<T>(readPage: (from: number, to: number) => PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>) {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const page = await readPage(from, from + size - 1);
    if (page.error) return { data: null, error: page.error };
    rows.push(...(page.data ?? []));
    if (!page.data || page.data.length < size) return { data: rows, error: null };
  }
}
