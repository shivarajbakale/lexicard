import { Asset } from 'expo-asset';
import PhotoSwipe, { type Bounds } from 'photoswipe';
import 'photoswipe/style.css';
import { useEffect, useRef } from 'react';
import type { ImageSourcePropType } from 'react-native';

import type { ImageViewerProps } from './ImageViewer.types';

// Card pictures are all 1024x768.
const W = 1024;
const H = 768;

function srcOf(source: ImageSourcePropType): string {
  if (typeof source === 'number') return Asset.fromModule(source).uri;
  if (typeof source === 'string') return source;
  const one = Array.isArray(source) ? source[0] : source;
  return (one as { uri?: string } | undefined)?.uri ?? '';
}

/**
 * Web: PhotoSwipe. The picture zooms out of the card into a full-screen viewer; pinch, double-tap or
 * ctrl+wheel zooms, drag pans, and a flick down, Esc or a tap on the dimmed backdrop closes it.
 */
export function ImageViewer({ source, label, visible, onClose, fromId }: ImageViewerProps) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!visible) return;
    const pswp = new PhotoSwipe({
      // msrc: the same picture is shown at once while it zooms out of the card (no grey placeholder).
      dataSource: [{ src: srcOf(source), msrc: srcOf(source), width: W, height: H, alt: label }],
      showHideAnimationType: 'zoom',
      bgOpacity: 0.96,
      initialZoomLevel: 'fit',
      secondaryZoomLevel: 2.5,
      maxZoomLevel: 4,
      wheelToZoom: false,
      imageClickAction: 'zoom-or-close',
      tapAction: 'toggle-controls',
      doubleTapAction: 'zoom',
      bgClickAction: 'close',
      arrowPrev: false,
      arrowNext: false,
      counter: false,
      closeTitle: 'Close picture',
      zoomTitle: 'Zoom',
    });
    // Animate from (and back into) the picture on the card. It is drawn "contain", so find the image inside its box.
    pswp.addFilter('thumbBounds', (bounds) => {
      const el = fromId ? document.getElementById(fromId) : null;
      // No picture to come from: PhotoSwipe falls back to a fade.
      if (!el) return bounds as Bounds;
      const r = el.getBoundingClientRect();
      const w = Math.min(r.width, (r.height * W) / H);
      return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - (w * H) / W) / 2, w };
    });
    pswp.on('destroy', () => close.current());
    pswp.init();
    return () => {
      if (!pswp.isDestroying) pswp.destroy();
    };
    // Opened once per `visible`; the picture can't change while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return null;
}
