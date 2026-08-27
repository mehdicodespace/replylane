type Data = Record<string, any>;
export function memoryDB() {
  const state = new Map<string, Data>();
  let queue: Promise<unknown> = Promise.resolve();
  const copy = (data: Data | undefined) => (data === undefined ? undefined : structuredClone(data));
  function doc(path: string): any {
    return {
      id: path.split("/").at(-1),
      path,
      collection: (name: string) => collection(`${path}/${name}`),
      get: async () => snapshot(path),
      set: async (data: Data, options?: { merge?: boolean }) => {
        state.set(path, options?.merge ? { ...state.get(path), ...copy(data) } : copy(data)!);
      },
      update: async (data: Data) => {
        if (!state.has(path)) throw new Error("Missing document");
        state.set(path, { ...state.get(path), ...copy(data) });
      },
      delete: async () => {
        state.delete(path);
      },
    };
  }
  function snapshot(path: string) {
    return {
      id: path.split("/").at(-1),
      exists: state.has(path),
      data: () => copy(state.get(path)),
      ref: doc(path),
    };
  }
  function collection(
    path: string,
    conditions: ((data: Data) => boolean)[] = [],
    sort?: string,
    count = Infinity,
  ): any {
    return {
      doc: (id: string) => doc(`${path}/${id}`),
      where: (field: string, op: string, value: any) =>
        collection(
          path,
          [...conditions, (d) => (op === "==" ? d[field] === value : d[field] <= value)],
          sort,
          count,
        ),
      orderBy: (field: string) => collection(path, conditions, field, count),
      limit: (n: number) => collection(path, conditions, sort, n),
      get: async () => {
        let entries = [...state.entries()].filter(
          ([key, d]) =>
            key.startsWith(path + "/") &&
            !key.slice(path.length + 1).includes("/") &&
            conditions.every((fn) => fn(d)),
        );
        if (sort) entries.sort((a, b) => (a[1][sort] > b[1][sort] ? 1 : -1));
        const docs = entries.slice(0, count).map(([key]) => snapshot(key));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
  }
  const db = {
    collection,
    runTransaction: <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      const result = queue.then(() =>
        fn({
          get: (ref: any) => ref.get(),
          set: (ref: any, data: Data, opts?: any) => ref.set(data, opts),
          create: (ref: any, data: Data) => {
            if (state.has(ref.path)) throw new Error("Document already exists");
            return ref.set(data);
          },
          update: (ref: any, data: Data) => ref.update(data),
        }),
      );
      queue = result.catch(() => {});
      return result;
    },
  };
  return { db, state, doc };
}
