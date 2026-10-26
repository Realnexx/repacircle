import { requireClient } from '@/lib/api/client'
export async function validateImage(file: File) {
  if (file.size > 2 * 1024 * 1024) throw new Error('Choose an image of 2 MB or less.')
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (!(
    (file.type === 'image/png' && png) ||
    (file.type === 'image/jpeg' && jpeg) ||
    (file.type === 'image/webp' && webp)
  ))
    throw new Error('Choose a PNG, JPEG or WebP image.')
}
export async function uploadPrivateImage(
  bucket: 'avatars' | 'organization-logos',
  scope: string,
  file: File,
) {
  await validateImage(file)
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png'
  const path = `${scope}/${crypto.randomUUID()}.${extension}`
  const { error } = await requireClient()
    .storage.from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}
export async function privateImageUrl(bucket: string, path: string) {
  const { data, error } = await requireClient().storage.from(bucket).createSignedUrl(path, 60)
  if (error) throw error
  return data.signedUrl
}
export async function removePrivateImage(bucket: string, path: string) {
  const { error } = await requireClient().storage.from(bucket).remove([path])
  if (error) throw error
}
