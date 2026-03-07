import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const formData = await req.formData();
    const password = formData.get('password');
    const questionId = formData.get('questionId');
    const storagePath = formData.get('path');
    const action = formData.get('action');

    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // DELETE image
    if (action === 'delete') {
      if (!questionId) return Response.json({ error: 'Missing questionId' }, { status: 400 });

      if (storagePath) {
        await supabase.storage.from('question-images').remove([storagePath]);
      }

      // Fetch cluster info before clearing
      const { data: q } = await supabase
        .from('questions')
        .select('cluster_code, state, category')
        .eq('id', questionId)
        .single();

      const { error: dbError } = await supabase
        .from('questions')
        .update({ image_url: null })
        .eq('id', questionId);
      if (dbError) throw new Error(dbError.message);

      // Propagate null to all language rows in the same cluster
      if (q?.cluster_code && q?.state && q?.category) {
        await supabase
          .from('questions')
          .update({ image_url: null })
          .eq('cluster_code', q.cluster_code)
          .eq('state', q.state)
          .eq('category', q.category)
          .neq('id', questionId);
      }

      return Response.json({ ok: true });
    }

    // UPLOAD image
    const file = formData.get('file');
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

    // Fetch cluster info before updating
    const { data: q } = await supabase
      .from('questions')
      .select('cluster_code, state, category')
      .eq('id', questionId)
      .single();

    const { error: dbError } = await supabase
      .from('questions')
      .update({ image_url: publicUrl })
      .eq('id', questionId);
    if (dbError) throw new Error(dbError.message);

    // Propagate image_url to all language rows in the same cluster
    if (q?.cluster_code && q?.state && q?.category) {
      await supabase
        .from('questions')
        .update({ image_url: publicUrl })
        .eq('cluster_code', q.cluster_code)
        .eq('state', q.state)
        .eq('category', q.category)
        .neq('id', questionId);
    }

    return Response.json({ ok: true, url: publicUrl });
  } catch (err) {
    console.error('Image upload error:', err.message);
    return Response.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
