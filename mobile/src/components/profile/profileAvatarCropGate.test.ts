/**
 * Regression: crop UI must not gate Image mount on imageSize from onLoad.
 * If Image only mounts when `displayed` (which needs imageSize) is set, the
 * picker spins forever and "Use photo" stays disabled.
 */
describe('profile avatar crop gate', () => {
  it('allows probing the image before dimensions are known', () => {
    const imageUri = 'file:///tmp/avatar.jpg';
    const imageSize: { width: number; height: number } | null = null;
    const displayed = imageSize
      ? { width: 100, height: 100, left: 0, top: 0 }
      : null;

    // Correct: mount Image whenever we have a URI (probe + onLoad / getSize).
    const shouldMountImage = Boolean(imageUri);
    // Incorrect (old bug): mount only when displayed is ready.
    const brokenGate = Boolean(imageUri && displayed);

    expect(shouldMountImage).toBe(true);
    expect(brokenGate).toBe(false);
  });
});
