export const GOOGLE_CLIENT_ID = '152931447210-n74pn4cbf684tskfej3n29metglnakq3.apps.googleusercontent.com';
export const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let accessToken: string | null = null;

export function loadGoogleIdentityServices(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if ((window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

export async function authenticateGoogleDrive(): Promise<boolean> {
  await loadGoogleIdentityServices();
  return new Promise((resolve, reject) => {
    try {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          accessToken = response.access_token;
          resolve(true);
        },
      });
      client.requestAccessToken();
    } catch (e) {
      reject(e);
    }
  });
}

export function getCachedAccessToken(): string {
  if (!accessToken) throw new Error('Not authenticated');
  return accessToken;
}

export async function uploadToGoogleDrive(filename: string, content: string): Promise<any> {
  const token = getCachedAccessToken();
  const metadata = {
    name: filename,
    mimeType: 'application/json',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'application/json' }));

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error('Failed to upload file to Google Drive');
  }
  return res.json();
}

export async function listFilesFromGoogleDrive(): Promise<any[]> {
  const token = getCachedAccessToken();
  const q = encodeURIComponent("name contains 'backup' and trashed=false");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc`, {
    headers: {
      Authorization: `Bearer ${token}`,
    }
  });
  if (!res.ok) {
    throw new Error('Failed to list files from Google Drive');
  }
  const data = await res.json();
  return data.files || [];
}

export async function downloadFileFromGoogleDrive(fileId: string): Promise<string> {
  const token = getCachedAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${token}`,
    }
  });
  if (!res.ok) {
    throw new Error('Failed to download file from Google Drive');
  }
  return res.text();
}

export async function deleteFileFromGoogleDrive(fileId: string): Promise<void> {
  const token = getCachedAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    }
  });
  if (!res.ok) {
    throw new Error('Failed to delete file from Google Drive');
  }
}
