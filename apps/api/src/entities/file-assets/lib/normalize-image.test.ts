import { expect, it } from 'vitest';
import sharp from 'sharp';
import { normalizeImage } from './normalize-image';

it('rotește, limitează dimensiunile și elimină metadatele din avatar', async () => {
  const input = await sharp({
    create: { width: 900, height: 600, channels: 3, background: '#cc4400' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const output = await normalizeImage(input, 'image/jpeg', 'STAFF_AVATAR');
  const metadata = await sharp(output.bytes).metadata();
  expect(metadata.format).toBe('webp');
  expect(metadata.width).toBeLessThanOrEqual(512);
  expect(metadata.height).toBeLessThanOrEqual(512);
  expect(metadata.orientation).toBeUndefined();
  expect(metadata.exif).toBeUndefined();
  expect(output.width).toBe(metadata.width);
  expect(output.height).toBe(metadata.height);
});

it('refuză tip fals, date corupte și imagini peste limita de pixeli', async () => {
  const input = await sharp({
    create: { width: 1, height: 1, channels: 3, background: '#cc4400' },
  })
    .png()
    .toBuffer();
  await expect(normalizeImage(input, 'image/jpeg', 'PRODUCT_IMAGE')).rejects.toMatchObject({
    status: 415,
  });
  await expect(
    normalizeImage(Buffer.from('not an image'), 'image/png', 'PRODUCT_IMAGE'),
  ).rejects.toMatchObject({
    status: 415,
  });
  const huge = await sharp({
    create: { width: 4001, height: 4001, channels: 3, background: '#cc4400' },
  })
    .png()
    .toBuffer();
  await expect(normalizeImage(huge, 'image/png', 'PRODUCT_IMAGE')).rejects.toMatchObject({
    status: 415,
  });
});

it('refuză imagini WebP animate fără a extrage doar primul cadru', async () => {
  const frames = Buffer.concat([Buffer.alloc(12, 0), Buffer.alloc(12, 255)]);
  const animated = await sharp(frames, {
    raw: { width: 2, height: 4, channels: 3, pageHeight: 2 },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  expect((await sharp(animated).metadata()).pages).toBe(2);
  await expect(normalizeImage(animated, 'image/webp', 'PRODUCT_IMAGE')).rejects.toMatchObject({
    status: 415,
  });
});

it('admite cel mult două decodări simultane fără coadă de buffere', async () => {
  const input = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#224466' },
  })
    .png()
    .toBuffer();
  const results = await Promise.allSettled(
    Array.from({ length: 3 }, () => normalizeImage(input, 'image/png', 'PRODUCT_IMAGE')),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
  expect(results.filter((result) => result.status === 'rejected')).toMatchObject([
    { reason: { status: 429 } },
  ]);
});
