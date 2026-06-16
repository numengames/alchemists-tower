import { describe, expect, it } from 'vitest';

import { relativePathForKey } from './assets-download';

describe('relativePathForKey', () => {
  const prefix = 'hyperfy-spaces/numinia/genesis/latest/';

  it('strips the world prefix, yielding the engine-relative path', () => {
    expect(relativePathForKey(prefix, `${prefix}assets/abc123.glb`)).toBe('assets/abc123.glb');
  });

  it('handles nested asset paths', () => {
    expect(relativePathForKey(prefix, `${prefix}assets/sub/dir/tex.png`)).toBe(
      'assets/sub/dir/tex.png',
    );
  });

  it('throws when the key is not under the prefix', () => {
    expect(() => relativePathForKey(prefix, 'other/place/x.glb')).toThrow(/not under prefix/);
  });
});
