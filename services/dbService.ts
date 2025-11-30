
import { ProjectData, ProjectSnapshot } from '../types';
import { IDBPDatabase, openDB } from 'idb';

const DB_NAME = 'FontCreatorDB';
const DB_VERSION = 3;
const STORE_NAME = 'projects';
const CACHE_STORE_NAME = 'fontCache';
const SNAPSHOT_STORE_NAME = 'snapshots';

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = (): Promise<IDBPDatabase> => {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const store = db.createObjectStore(STORE_NAME, {
                            keyPath: 'projectId',
                            autoIncrement: true,
                        });
                        store.createIndex('scriptId', 'scriptId', { unique: false });
                        store.createIndex('savedAt', 'savedAt', { unique: false });
                    }
                }
                if (oldVersion < 2) {
                    if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
                        db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'projectId' });
                    }
                }
                if (oldVersion < 3) {
                    if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
                        db.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: 'projectId' });
                    }
                }
            },
        });
    }
    return dbPromise;
};

export const addProject = async (projectData: Omit<ProjectData, 'projectId'>): Promise<number> => {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const id = await store.add(projectData);
    await tx.done;
    return id as number;
};

export const updateProject = async (projectId: number, projectData: ProjectData): Promise<void> => {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.store.put(projectData);
    await tx.done;
};

export const getProject = async (projectId: number): Promise<ProjectData | undefined> => {
    const db = await getDb();
    return db.get(STORE_NAME, projectId);
};

export const getRecentProjects = async (limit: number = 5): Promise<ProjectData[]> => {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.store.index('savedAt');
    const projects: ProjectData[] = [];
    let cursor = await index.openCursor(null, 'prev');
    while (cursor && projects.length < limit) {
        projects.push(cursor.value);
        cursor = await cursor.continue();
    }
    await tx.done;
    return projects;
};

export const deleteProject = async (projectId: number): Promise<void> => {
    const db = await getDb();
    const tx = db.transaction([STORE_NAME, CACHE_STORE_NAME, SNAPSHOT_STORE_NAME], 'readwrite');
    await tx.objectStore(STORE_NAME).delete(projectId);
    await tx.objectStore(CACHE_STORE_NAME).delete(projectId);
    await tx.objectStore(SNAPSHOT_STORE_NAME).delete(projectId);
    await tx.done;
};

// --- Font Cache Functions ---

interface FontCacheEntry {
    projectId: number;
    hash: string;
    fontBinary: Blob;
}

export const getFontCache = async (projectId: number): Promise<FontCacheEntry | undefined> => {
    const db = await getDb();
    return db.get(CACHE_STORE_NAME, projectId);
};

export const setFontCache = async (projectId: number, hash: string, fontBinary: Blob): Promise<void> => {
    const db = await getDb();
    const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
    await tx.store.put({ projectId, hash, fontBinary });
    await tx.done;
};

export const deleteFontCache = async (projectId: number): Promise<void> => {
    const db = await getDb();
    await db.delete(CACHE_STORE_NAME, projectId);
};

// --- Snapshot Functions ---

export const saveSnapshot = async (snapshot: ProjectSnapshot): Promise<void> => {
    const db = await getDb();
    const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
    await tx.store.put(snapshot);
    await tx.done;
};

export const getSnapshot = async (projectId: number): Promise<ProjectSnapshot | undefined> => {
    const db = await getDb();
    return db.get(SNAPSHOT_STORE_NAME, projectId);
};

export const deleteSnapshot = async (projectId: number): Promise<void> => {
    const db = await getDb();
    await db.delete(SNAPSHOT_STORE_NAME, projectId);
};