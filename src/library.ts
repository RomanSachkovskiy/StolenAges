import type { Replay } from "./replay";
import type { OpponentCount } from "./world";

export const libraryLimit = 5;
export class LibraryFull extends Error {}

export interface MatchSummary {
  id: string;
  savedAt: number;
  opponents: OpponentCount;
  round: number;
  winner: number | null;
}

export interface SavedMatch extends MatchSummary {
  replay: Replay;
  era: number;
  selected: number;
  playedMs: number;
  aiMs: number;
  crashes: number;
}

export interface ReplaySummary {
  id: string;
  savedAt: number;
  opponents: OpponentCount;
  round: number;
  winner: number;
  label?: string;
}

export interface ArchivedReplay extends ReplaySummary {
  replay: Replay;
}

type Collections = {
  matches: { summary: MatchSummary; data: SavedMatch };
  replays: { summary: ReplaySummary; data: ArchivedReplay };
};
type Collection = keyof Collections;
let opening: Promise<IDBDatabase> | undefined;

function database() {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("stolen-ages.library", 1);
    request.onupgradeneeded = () => {
      for (const collection of ["matches", "replays"]) {
        request.result.createObjectStore(collection, { keyPath: "id" });
        request.result.createObjectStore(collection + "-data", {
          keyPath: "id",
        });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        opening = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
  opening.catch(() => {
    opening = undefined;
  });
  return opening;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listRecords<K extends Collection>(
  collection: K,
): Promise<Collections[K]["summary"][]> {
  const db = await database();
  const store = db.transaction(collection).objectStore(collection);
  const records = await requestResult<Collections[K]["summary"][]>(
    store.getAll(),
  );
  return records.sort((a, b) => b.savedAt - a.savedAt);
}

export async function getRecord<K extends Collection>(
  collection: K,
  id: string,
): Promise<Collections[K]["data"] | undefined> {
  const db = await database();
  const name = collection + "-data";
  return requestResult(db.transaction(name).objectStore(name).get(id));
}

export async function writeRecord<K extends Collection>(
  collection: K,
  summary: Collections[K]["summary"],
  data: Collections[K]["data"],
  mayCreate = true,
) {
  const db = await database();
  const name = collection + "-data";
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([collection, name], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Save interrupted"));
    const store = tx.objectStore(collection);
    const found = store.get(summary.id);
    found.onsuccess = () => {
      const write = () => {
        store.put(summary);
        tx.objectStore(name).put(data);
      };
      if (found.result !== undefined) {
        if (
          collection === "matches" &&
          found.result.winner !== null &&
          summary.winner === null
        ) {
          reject(new Error("The saved match is already complete"));
          tx.abort();
        } else write();
      } else if (!mayCreate) {
        reject(new Error("The saved match was deleted"));
        tx.abort();
      } else {
        const count = store.count();
        count.onsuccess = () => {
          if (count.result < libraryLimit) write();
          else {
            reject(new LibraryFull());
            tx.abort();
          }
        };
      }
    };
  });
}

export async function deleteRecord(collection: Collection, id: string) {
  const db = await database();
  const name = collection + "-data";
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([collection, name], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Delete interrupted"));
    tx.objectStore(collection).delete(id);
    tx.objectStore(name).delete(id);
  });
}
