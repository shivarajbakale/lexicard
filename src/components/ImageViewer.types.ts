import type { ImageSourcePropType } from 'react-native';

export interface ImageViewerProps {
  source: ImageSourcePropType;
  label: string;
  visible: boolean;
  onClose: () => void;
  /** id (nativeID) of the picture on screen the viewer opens from and closes back into */
  fromId?: string;
}
