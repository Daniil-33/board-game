import { Texture } from 'pixi.js';

export type LogoLoader = (url: string) => Promise<Texture>;

export function cacheLogoTextures(load: LogoLoader) {
  const cache = new Map<string, Promise<Texture | null>>();
  return (url: string): Promise<Texture | null> => {
    let texture = cache.get(url);
    if (texture === undefined) {
      texture = Promise.resolve().then(() => load(url)).catch(() => null);
      cache.set(url, texture);
    }
    return texture;
  };
}

export const loadLogoTexture = cacheLogoTextures(async url => {
  const image = new Image();
  image.src = url;
  await image.decode();
  return Texture.from(image);
});
