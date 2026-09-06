'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Timeline, TimelineClip } from '@/lib/projects/timeline';
import { getMediaAsset } from '@/lib/storage/indexed-media';

export interface ExportProgress {
    stage: 'loading' | 'writing' | 'processing' | 'completed' | 'error';
    progress: number;
    message: string;
}

export interface ExportResult {
    success: boolean;
    blob?: Blob;
    error?: string;
}

// Global FFmpeg instance to avoid reloading
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;

async function loadFFmpeg(): Promise<FFmpeg> {
    if (ffmpegLoaded && ffmpegInstance) {
        return ffmpegInstance;
    }

    const ffmpeg = new FFmpeg();
    
    // Set up logging
    ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
    });

    // Load FFmpeg core from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'application/javascript'),
    });

    ffmpegInstance = ffmpeg;
    ffmpegLoaded = true;
    return ffmpeg;
}

function getFFmpegArgs(
    clips: TimelineClip[],
    timelineDuration: number,
    aspectRatio: string,
    fps: number
): string[] {
    // Parse aspect ratio
    const [w, h] = aspectRatio.split(':').map(Number);
    const width = w * 100; // Base width, will scale
    const height = h * 100;

    // Build filter complex for concatenation with trims
    const filterParts: string[] = [];
    const inputArgs: string[] = [];

    clips.forEach((clip, index) => {
        const inputName = `v${index}`;
        const inputFile = `input${index}.mp4`;
        inputArgs.push('-i', inputFile);

        // Apply trim if sourceStart/sourceEnd are set
        const sourceStart = clip.sourceStart ?? 0;
        const sourceEnd = clip.sourceEnd ?? clip.duration;
        const trimDuration = sourceEnd - sourceStart;

        if (sourceStart > 0 || sourceEnd < clip.duration) {
            // Need to trim
            filterParts.push(
                `[${inputName}]trim=start=${sourceStart}:end=${sourceEnd},setpts=PTS-STARTPTS[${inputName}_trimmed]`
            );
        } else {
            filterParts.push(`[${inputName}]copy[${inputName}_trimmed]`);
        }
    });

    // Concatenate all trimmed clips
    const concatInputs = clips.map((_, i) => `[v${i}_trimmed]`).join('');
    filterParts.push(`${concatInputs}concat=n=${clips.length}:v=1:a=0[outv]`);

    // Scale to target aspect ratio
    filterParts.push(`[outv]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[final]`);

    const args = [
        ...inputArgs,
        '-filter_complex', filterParts.join(';'),
        '-map', '[final]',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        'output.mp4'
    ];

    return args;
}

export async function exportTimelineToMP4(
    timeline: Timeline,
    onProgress?: (progress: ExportProgress) => void
): Promise<ExportResult> {
    try {
        onProgress?.({ stage: 'loading', progress: 0, message: 'Cargando FFmpeg...' });
        
        const ffmpeg = await loadFFmpeg();
        
        onProgress?.({ stage: 'writing', progress: 10, message: 'Escribiendo archivos de entrada...' });
        
        // Write input files to FFmpeg virtual filesystem
        for (let i = 0; i < timeline.clips.length; i++) {
            const clip = timeline.clips[i];
            let blob: Blob | undefined;
            
            if (clip.assetId) {
                // Media asset from IndexedDB
                const result = await getMediaAsset(clip.assetId);
                if (result) {
                    blob = result.blob;
                }
            } else if (clip.sceneId) {
                // Scene-generated asset - would need to resolve from scene's videoAssetId
                // For now, we'll skip clips without assetId
                console.warn(`Clip ${clip.id} has no assetId, skipping`);
                continue;
            }
            
            if (!blob) {
                console.warn(`No blob found for clip ${clip.id}`);
                continue;
            }
            
            const inputFile = `input${i}.mp4`;
            const arrayBuffer = await blob.arrayBuffer();
            await ffmpeg.writeFile(inputFile, new Uint8Array(arrayBuffer));
            
            onProgress?.({ 
                stage: 'writing', 
                progress: 10 + Math.floor((i / timeline.clips.length) * 40), 
                message: `Escribiendo clip ${i + 1}/${timeline.clips.length}...` 
            });
        }
        
        onProgress?.({ stage: 'processing', progress: 50, message: 'Procesando con FFmpeg...' });
        
        // Build and run FFmpeg command
        const args = getFFmpegArgs(timeline.clips, timeline.duration, timeline.aspectRatio, timeline.fps);
        
        // Set up progress tracking
        ffmpeg.on('progress', ({ progress }) => {
            onProgress?.({ 
                stage: 'processing', 
                progress: 50 + Math.floor(progress * 40), 
                message: `Procesando... ${Math.round(progress * 100)}%` 
            });
        });
        
        await ffmpeg.exec(args);
        
        onProgress?.({ stage: 'completed', progress: 95, message: 'Finalizando...' });
        
        // Read output file
        const outputData = await ffmpeg.readFile('output.mp4');
        let uint8Array: Uint8Array;
        if (typeof outputData === 'string') {
            // Base64 string - decode it
            const binaryString = atob(outputData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            uint8Array = bytes;
        } else {
            uint8Array = outputData;
        }
        const blob = new Blob([uint8Array as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
        
        onProgress?.({ stage: 'completed', progress: 100, message: 'Exportación completada' });
        
        return { success: true, blob };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido en FFmpeg';
        console.error('Export failed:', error);
        onProgress?.({ stage: 'error', progress: 0, message: `Error: ${message}` });
        return { success: false, error: message };
    }
}

// Cleanup function
export function cleanupFFmpeg(): void {
    ffmpegInstance = null;
    ffmpegLoaded = false;
}