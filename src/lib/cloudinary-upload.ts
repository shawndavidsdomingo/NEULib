/**
 * cloudinary-upload.ts  —  src/lib/cloudinary-upload.ts
 *
 * Shared utility for uploading images to Cloudinary via unsigned upload presets.
 * No backend required — uploads go directly from the browser to Cloudinary.
 *
 * ── Setup (one-time) ────────────────────────────────────────────────────────
 * 1. Create a free account at https://cloudinary.com  (no credit card)
 * 2. Go to Settings → Upload → Upload presets → Add upload preset
 *    - Signing mode: Unsigned
 *    - Folder: neu-library  (optional, keeps things organised)
 *    - Copy the preset name (e.g. "neu_library_unsigned")
 * 3. Copy your Cloud Name from the Dashboard top-left
 * 4. Add to your .env.local:
 *      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
 *      NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=neu_library_unsigned
 * ────────────────────────────────────────────────────────────────────────────
 */

export interface CloudinaryUploadResult {
  url:       string;   // permanent HTTPS URL — save this to Firestore
  publicId:  string;   // e.g. "neu-library/abc123" — save for future deletion
  width:     number;
  height:    number;
  format:    string;
  bytes:     number;
}

export interface UploadOptions {
  /** Cloudinary folder to place the file in. Defaults to env or 'neu-library'. */
  folder?: string;
  /** Progress callback — receives 0–100. */
  onProgress?: (pct: number) => void;
}

const CLOUD_NAME    = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME    || 'dvaz64wcw';
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'neu-library';

/** Max file size in bytes (5 MB). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Accepted MIME types. */
export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

/**
 * Upload a File to Cloudinary and return the result.
 * Uses XMLHttpRequest for progress tracking.
 */
export function uploadToCloudinary(
  file: File,
  options: UploadOptions = {},
): Promise<CloudinaryUploadResult> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    return Promise.reject(
      new Error(
        'Cloudinary is not configured. Add NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and ' +
        'NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET to your .env.local file.'
      )
    );
  }

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', UPLOAD_PRESET);
    form.append('folder', options.folder ?? 'neu-library');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);

    if (options.onProgress) {
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          options.onProgress!(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText);
        resolve({
          url:      data.secure_url,
          publicId: data.public_id,
          width:    data.width,
          height:   data.height,
          format:   data.format,
          bytes:    data.bytes,
        });
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err?.error?.message || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed (HTTP ${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(form);
  });
}

/**
 * Validate a file before uploading.
 * Returns an error string, or null if the file is valid.
 */
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Only image files are allowed.';
  if (file.size > MAX_IMAGE_BYTES) return `Image must be under ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`;
  return null;
}