// IndexedDB storage for media assets (video, audio, images)
// Using idb library for clean IndexedDB wrapper

import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  duration: number; // seconds
  width: number;
  height: number;
  thumbnail: string; // base64 data URL or blob URL
  fileId: string; // IndexedDB key for the blob
  createdAt: string;
  projectId?: string;
}

export interface ProjectMediaMap {
  [projectId: string]: MediaAsset[];
}

interface MediaDB extends DBSchema {
  media: {
    key: string;
    value: {
      id: string;
      projectId: string;
      asset: MediaAsset;
      blob: Blob;
    };
    indexes: { 'by-project': string; 'by-type': string };
  };
  thumbnails: {
    key: string;
    value: {
      id: string;
      dataUrl: string;
    };
  };
}

const DB_NAME = 'neurova-media';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MediaDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MediaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MediaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const mediaStore = db.createObjectStore('media', { keyPath: 'id' });
        mediaStore.createIndex('by-project', 'projectId');
        mediaStore.createIndex('by-type', 'asset.type');
        db.createObjectStore('thumbnails', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export { getDB };

export async function saveMediaAsset(
  projectId: string,
  asset: MediaAsset,
  blob: Blob
): Promise<void> {
  const db = await getDB();
  await db.put('media', { id: asset.id, projectId, asset, blob });
}

export async function getMediaAsset(id: string): Promise<{ asset: MediaAsset; blob: Blob } | undefined> {
  const db = await getDB();
  return db.get('media', id);
}

export async function getMediaAssetsByProject(projectId: string): Promise<Array<{ asset: MediaAsset; blob: Blob }>> {
  const db = await getDB();
  return db.getAllFromIndex('media', 'by-project', projectId);
}

export async function getMediaAssetsByType(projectId: string, type: MediaAsset['type']): Promise<Array<{ asset: MediaAsset; blob: Blob }>> {
  const db = await getDB();
  const all = await db.getAllFromIndex('media', 'by-project', projectId);
  return all.filter(item => item.asset.type === type);
}

export async function deleteMediaAsset(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('media', id);
}

export async function deleteMediaAssetsByProject(projectId: string): Promise<void> {
  const db = await getDB();
  const assets = await db.getAllFromIndex('media', 'by-project', projectId);
  for (const asset of assets) {
    await db.delete('media', asset.id);
  }
}

export async function saveThumbnail(id: string, dataUrl: string): Promise<void> {
  const db = await getDB();
  await db.put('thumbnails', { id, dataUrl });
}

export async function getThumbnail(id: string): Promise<string | undefined> {
  const db = await getDB();
  const thumb = await db.get('thumbnails', id);
  return thumb?.dataUrl;
}

export async function getTotalStorageSize(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll('media');
  return all.reduce((sum, item) => sum + item.blob.size, 0);
}

export async function clearAllMedia(): Promise<void> {
  const db = await getDB();
  await db.clear('media');
  await db.clear('thumbnails');
}

export async function generateVideoThumbnail(file: File, time = 1): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = URL.createObjectURL(file);
    
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(time, video.duration / 2);
    };
    
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        URL.revokeObjectURL(video.src);
        resolve(dataUrl);
      }
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve('');
    };
  });
}

export async function generateImageThumbnail(file: File): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            const canvas = document.createElement('canvas');
            const maxSize = 200;
            let { width, height } = img;
            if (width > height) {
                if (width > maxSize) {
                    height = (height * maxSize) / width;
                    width = maxSize;
                }
            } else {
                if (height > maxSize) {
                    width = (width * maxSize) / height;
                    height = maxSize;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                URL.revokeObjectURL(img.src);
                resolve(dataUrl);
            } else {
                URL.revokeObjectURL(img.src);
                resolve('');
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            resolve('');
        };
        img.src = URL.createObjectURL(file);
    });
}

export async function generateAudioThumbnail(file: File): Promise<string> {
    // For audio, we'll create a waveform visualization placeholder
    // For now, return a placeholder SVG as data URL
    const svg = `
    <svg width="200" height="100" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="100" fill="#1a1a2e"/>
      <g stroke="#10b981" stroke-width="2" fill="none">
        <path d="M 10 50 Q 30 20 50 50 T 90 50 T 130 50 T 170 50 T 190 50" />
      </g>
      <text x="100" y="85" text-anchor="middle" fill="#666" font-size="10">Audio</text>
    </svg>
  `;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}