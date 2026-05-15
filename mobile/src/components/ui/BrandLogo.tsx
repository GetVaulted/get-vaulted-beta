import WhiteLogo from '../../../assets/white-logo.svg';
import type { SvgProps } from 'react-native-svg';

const VIEW_W = 468.64;
const VIEW_H = 131.91;

type Props = {
  /** Total logo width; height follows artwork aspect ratio. */
  width?: number;
} & Omit<SvgProps, 'width' | 'height'>;

export function BrandLogo({ width = 200, ...rest }: Props) {
  const height = (width * VIEW_H) / VIEW_W;
  return <WhiteLogo width={width} height={height} {...rest} />;
}
