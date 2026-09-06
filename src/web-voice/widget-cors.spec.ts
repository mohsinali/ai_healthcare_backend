import { widgetAwareCors } from './widget-cors';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

describe('widgetAwareCors', () => {
  const resolve = (url: string, origin?: string) =>
    new Promise<CorsOptions>((done, reject) => {
      widgetAwareCors(['https://careflow.example'])(
        { url, headers: { origin } } as never,
        (error, options) => (error ? reject(error) : done(options)),
      );
    });

  it('permits only POST and Content-Type transport without credentials', async () => {
    await expect(
      resolve(
        '/api/v1/voice/web/widget-session',
        'https://unconfigured.example',
      ),
    ).resolves.toMatchObject({
      origin: 'https://unconfigured.example',
      credentials: false,
      methods: ['POST'],
      allowedHeaders: ['Content-Type'],
    });
  });

  it('does not grant CORS transport to malformed origins', async () => {
    await expect(
      resolve('/api/v1/voice/web/widget-session', 'null'),
    ).resolves.toMatchObject({ origin: false, credentials: false });
  });

  it('retains configured credentialed CORS for other application routes', async () => {
    await expect(
      resolve('/api/v1/tenants', 'https://careflow.example'),
    ).resolves.toEqual({
      origin: ['https://careflow.example'],
      credentials: true,
    });
  });
});
