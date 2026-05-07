import { describe, expect, it } from 'vitest';

import { envToAssetsSegment } from './s3-assets';

describe('envToAssetsSegment', () => {
  it('maps pre → dev and pro → latest', () => {
    expect(envToAssetsSegment('pre')).toBe('dev');
    expect(envToAssetsSegment('pro')).toBe('latest');
  });
});
