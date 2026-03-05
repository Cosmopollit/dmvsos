import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const formData = await req.formData();
    const password = formData.get('password');
    const file = formData.get('file');
    const questionId = formData.get('questionId');
    const storagePath = formData.get('path');

    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!file || !questionId || !storagePath) {
      return Response.json({ error: 'Missing file, questionId, or path' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('question-images')
      .upload(storagePath, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = supabase.storage
      .from('question-images')
      .getPublicUrl(storagePath);

    const { error: dbError } = await supabase
      .from('questions')
      .update({ image_url: publicUrl })
      .eq('id', questionId);
    if (dbError) throw new Error(dbError.message);

    return Response.json({ ok: true, url: publicUrl });
  } catch (err) {
    console.error('Image upload error:', err.message);
    return Response.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
