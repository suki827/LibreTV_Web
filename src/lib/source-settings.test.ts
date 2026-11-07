import { describe, expect, it } from 'vitest';
import { parseImportedSourceSettings } from './source-settings';

describe('legacy source imports', () => {
  it('migrates old live ownership and missing newer arrays before validation', () => {
    const data = parseImportedSourceSettings({
      customAPIs: [{ key: 'one', name: '源', url: 'https://source.example/api' }],
      selectedKeys: ['one'],
      liveSubscriptions: [{ url: 'https://live.example/list', fromSubscription: 'https://sub.example/list' }],
    });
    expect(data.liveSubscriptions[0].fromSubscriptions).toEqual(['https://sub.example/list']);
    expect(data.subscriptions).toEqual([]);
    expect(data.envSubsSeen).toEqual([]);
  });
});
