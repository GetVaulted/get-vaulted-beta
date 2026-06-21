import { describe, expect, it } from 'vitest';
import { APP_REF_WIDTH, appLayoutDimensions, appUniformScale } from './appUiScale';

describe('appUniformScale', () => {
  it('keeps Pro Max-class widths at 1:1', () => {
    expect(appUniformScale(APP_REF_WIDTH)).toBe(1);
    expect(appUniformScale(440)).toBe(1);
  });

  it('shrinks UI on iPhone 15-class widths', () => {
    expect(appUniformScale(393)).toBeCloseTo(393 / APP_REF_WIDTH, 5);
    expect(appUniformScale(393)).toBeLessThan(1);
  });

  it('expands the layout canvas so scaled content fills the physical viewport', () => {
    const scale = appUniformScale(393);
    const dims = appLayoutDimensions(393, 852, scale);
    expect(dims.layoutWidth * scale).toBeCloseTo(393, 5);
    expect(dims.layoutHeight * scale).toBeCloseTo(852, 5);
    expect(dims.layoutWidth).toBeGreaterThan(393);
  });
});
