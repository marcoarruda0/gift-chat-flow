INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true);

CREATE POLICY "tenant_upload_chat_media" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "public_read_chat_media" ON storage.objects
FOR SELECT USING (bucket_id = 'chat-media');