import { useEffect, useState } from 'react';

/** Load an image src into an HTMLImageElement for use with react-konva. */
export function useHtmlImage(src: string | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) {
      setImg(null);
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = src;
    const onload = () => setImg(image);
    image.addEventListener('load', onload);
    return () => image.removeEventListener('load', onload);
  }, [src]);
  return img;
}
