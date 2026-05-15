import { supabase } from '@/integrations/supabase/client';

export async function uploadAudioToStorage(file: File): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `uploads/${fileName}`;

  // Use signed upload URL to bypass any proxy/middleware body size limits
  const { data: signedData, error: signedError } = await supabase.storage
    .from('audios')
    .createSignedUploadUrl(filePath);

  if (signedError || !signedData) {
    throw new Error(`Error creating upload URL: ${signedError?.message || 'Unknown error'}`);
  }

  const { error } = await supabase.storage
    .from('audios')
    .uploadToSignedUrl(filePath, signedData.token, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`Error uploading audio: ${error.message}`);
  }

  return filePath;
}

export async function uploadTemplateToStorage(file: File): Promise<string> {
  const fileName = `${Date.now()}-${file.name}`;
  const filePath = `templates/${fileName}`;

  const { error } = await supabase.storage
    .from('plantillas')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    throw new Error(`Error uploading template: ${error.message}`);
  }

  return filePath;
}

export async function uploadReportToStorage(blob: Blob, fileName: string): Promise<string> {
  const filePath = `reports/${Date.now()}-${fileName}`;

  const { error } = await supabase.storage
    .from('informes')
    .upload(filePath, blob, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    });

  if (error) {
    throw new Error(`Error uploading report: ${error.message}`);
  }

  return filePath;
}

export async function getStorageUrl(bucket: string, path: string): Promise<string> {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function downloadFile(bucket: string, path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  
  if (error) {
    throw new Error(`Error downloading file: ${error.message}`);
  }
  
  return data;
}

export async function deleteFile(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  
  if (error) {
    throw new Error(`Error deleting file: ${error.message}`);
  }
}
