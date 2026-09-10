import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * Applies all shared middleware, pipes, interceptors, CORS, and Swagger
 * configuration to both standalone HTTP servers and Vercel serverless functions.
 */
export function configureApp(app: INestApplication) {
  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // For Swagger UI
    }),
  );

  // CORS configuration supporting local dev, Tauri desktop, and production web frontends
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or desktop Tauri clients)
      if (!origin) return callback(null, true);

      const allowedStatic = [
        'http://localhost:1420',
        'http://localhost:3000',
        'tauri://localhost',
        'http://127.0.0.1:1420',
      ];

      const frontendUrl = process.env.FRONTEND_URL;
      if (frontendUrl && origin === frontendUrl) {
        return callback(null, true);
      }

      if (allowedStatic.includes(origin)) {
        return callback(null, true);
      }

      // Allow any Vercel preview or production deployments of the web app if on Vercel
      if (origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }

      // In non-production environments, allow any localhost origin
      if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
        return callback(null, true);
      }

      return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'stripe-signature', 'x-webhook-signature'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global request ID and error formatting
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Proxy/redirect Swagger UI static assets to CDN for serverless hosting (Vercel)
  app.use((req: any, res: any, next: any) => {
    const url = req.originalUrl || req.url || '';
    if (url.includes('swagger-ui.css')) {
      return res.redirect(302, 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui.min.css');
    }
    if (url.includes('swagger-ui-bundle.js')) {
      return res.redirect(302, 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-bundle.js');
    }
    if (url.includes('swagger-ui-standalone-preset.js')) {
      return res.redirect(302, 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-standalone-preset.js');
    }
    if (url.includes('favicon-32x32.png') || url.includes('favicon-16x16.png')) {
      return res.redirect(302, 'https://swagger.io/favicon.png');
    }
    next();
  });

  // Swagger / OpenAPI setup
  const config = new DocumentBuilder()
    .setTitle('Meeting Recorder SaaS API')
    .setDescription('Full commercial SaaS Backend, Auth, Licensing, Subscriptions, Usage, Admin APIs, and Webhooks')
    .setVersion('1.0.0')
    .addTag('OCR', 'OCR and screenshot text extraction')
    .addTag('Screenshots', 'Daily screenshot authorization and quota')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customCssUrl: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui.min.css',
    ],
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-bundle.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.18.2/swagger-ui-standalone-preset.js',
    ],
    customSiteTitle: 'MeetMind SaaS API Docs',
    customfavIcon:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAO4ElEQVR4nL2aa6wd1XXHf2vPzDn3RWywr3kYsAGT8EghpqQJihpIRCsFlEhp69BCGkijCFXqp36rVNVCaqr2Q5ovTaS8+khRBSJpFCrUPBTapCokvElIiIlf12BsY1/fe8+558xr77X6YWbOmbm+0KpSO/b4nDmzZ8//v9Z/rb332oa3OPbt2xcB8lZt/o8PAaL/rsFmhwMMMOccd95595433jh+Q5YVl4fgzwNQ1bqp1n/D9GlVtHOv+1vzaNNH976NYxcvLSzMvfDyyy8cNLMGpzRN35LAvn37okceeSREUcQtt9z+e6dPn/nD8Xh0i/caqwbqDgGrH7bW0xu+W/Vpk8vme/fTJk2raxFBxMo4jn7U7/W+cPz4kYfq90bQttQGAg34D3/443sOHz7wxZWVwQezPMNUESG0UE0elAa01PilJtYGXxNquJtNf7cJCauvwTDBiBAhiiKSOH58Zkv//tcOHTq4kcSEwP79+90DDzygH/rQb9/8y18eemxldXWHhuCdcwLmAJEWHMFAuhaQjgemHulafeoJs3NJ2bSdGaZmZiIujuPojZn+3J0nTx5+hkri2iKw38EDdtdd9+565pkXnjq7srLoBA8STy3eAt9YuelgQsQ2aPItCLQ/rUuoQ6T67oE4juPTW7fM/NrS0tJS/Wp1VZMHMDP56U9/9rXVtbVFeRPwIvWJIICT+mx/3+SMNvlNatLS/j6xiE1dW7koBvPe+8XVQfYP+/fvn9jJ3XrrrTGg73vf7fvW1oa/riF4eTPwNGCtA8S5BqjgHESTU4iae04qIm5zUhuJyDmSlNjMvAZ9/+c//+V9tYRiAZxzTvfsufHJ5eWz76luWLQZeGnkU19HTqqXdzxUy0a7IpLasmpd2QSFoIbWvzWfZlRtu7ILgEvi6Mdra6dvobIH+pGP7LsqTdN3q2pr4Jhmm43gYxFiDF/kFOOckJa4LCCp4kdGSI1EjJ6rzkSMkIJfF2TkcGNBR0IxNEKuxGIkrvuuhnQ7VYsQgUlQfffi4mVXARoDvP76yZu8D3V6sqgTjGKV4sWIBGKMIs+5IOqx98Kd3HTx+ezeHvG2hQKNRpxYH/HsUsoTBwOpKoYxJzG3XKfcvMe4aKvhiFgbOY68ITx3RHnuWMnZwtObBS/gdRoKrY/mSwCiEMq9wKEYIMuKXVrlems1RxoiYvQEJAT6Ktx9xfXcc927uO7i7cj8CHorEK9CbxVmYj4RGT85vs5ffyMB4I8/NuCGKwAXgUb1KxxYTMhjfn5MePCHBV9/dkgaeSQSign4Wn42HRLNIBi7AGIAVZ2djrAtt9Uu7AHiPZcn8/z5Te/j1t17IBbKwvAaYUmMJQmW9CGbQXpz3HBZwWc/PYSoYNtWWB/1MRWwGCxCLEJwxCL8yq6Ev7pvjg/duMCfPHyGpVFKryfktSfMpniqC0NM56YEJi4yGrqNFhMxXAjsThb40rtv4+2LOxiPR0gSE/USZnvzkETQc9ATVAJ56RmteeYXVkEiRoMEJ0K/74hiqVXqwEdkeUSaRYjBbe+a42tbL+WTXzrOkdGIXlx5okkSNfbOEVO5oMuwRh9hJGosWMJfXnMzb59/G+ujMVEvoZ8IToSjp09zcOUUy9lZ4rjgpqtm2HXJFrJsTMgvQLSH9HP6WwqWjkY894uYUoVtWxxXXyZcsTPGgqMsIrIhXL1zhs9+9BLu+8clhloQEJSpUa3Gph0CHTfJREY9QL3yuxdfyXvfto31cYrrJ/QRTq8PePCZF3n+5OuMygJMSMzxHz+Z549+Yze7Fs8nX9mOWczM9hGHj63xN9/0nBgUlKIggbmesvcdxifumGPH+RFFFpGuBN6ze457btzOF549QW/GCFZNxCbzLQNXU2hioImSBj+RGc6UHfEMv7NtJ74swDl6BieGa3zm+f/k2HjITD8hins4gXkXEeFYOuK5zG/BvzYLOEIxw7HXekTuNHPnF4yCEjBShX/7SeDQa4E/+4MLuPA8hy8UH4x9123lmy+tcErHOGEyPjTx2XjAcc5hCEaMYWq8a34ru+MZsqJENGBe+dtfvMDRbEgy0yP1RlYaRQG5GnO9hEh6pK9kzN7/CWbv/zjpgZzI5pjrR+QB8sLICiMtjXhBObJS8JVvDbEC8EI2ht3zPfbumAcvJExlPZn96aYE6vk4lf4jE67pL5CYEHygb8KhtWVeXDtDFMeM8kAhyprlDEJOCJCbMspLWJzBf+vb+G99G7bPMMpLclOCGsPCWPNKLoFRpkQzxvNLKQePFvSJ8DkkQbh26wyROWI2TNs3BrE2U32aNkZk0BPHYpygQVFR4mC8uj5g3QJ4R+kC3oxrt2wnFsfx1TUGoWRpsM6FCwm71w8BwtESjg7WGYSSLHO84zLFi/Hya444CkhwlCGwdMrzji0OLQJmwo5eQk8cuXkcdRzUa44OAbSFv44DB0Q4EgQLijrDgpIFT2kQiVGqct8V1/Gpa/Zi/ZiHDrzEo798icMupjymHJqfBeDkKOVVP2R1XfnYb65z1x1rOBG++i8L/N13EuK+EsyR5WBFdaoKCY5YHCWC2Ib82SGwgYGYIVbNEs0MVcVMsaDVNYaqsdib5aOLuwjjDF9G3H319SytLPPTMyfI+4Fj6ToAhXiWx54brxTuvj0iKyLixPNbt4157InzWU0rBZjW4EvBAuArQ8qm2HUaA6pNduq2rOYjVTCbanXWrRzgLXBquIbLC3ya4scZ911zI3NJn+VxznJasJzlLI9L5maET95+CTq6mDDaQUSfN5YTfOGqLANoAC3ASkGLikRnrdCk+hZO12bTmTU1cxE1NFQW16AVmbrDsQ88fPIQZZrhck+2PubieJZ7rn4no+DrMzAqPL//3uu5eH43xWAHSXkROryEhx7byrjQSeq2AFZILSOB0I7Y1uq6ZWc3/bGZudt0UKsJWAM81FICFCNGeHq4zKMnl5grApYXjAZDPrBtJ7ftvJSxlYxDwQeuvoJbd/0qxep2XHYhM3YJj35/nqcOBOIkEJp5/wYC1izdbQq6wd4ZB3TiAGu5qSFWaz80UqraqUBhAVHhn88e46XVZWYLRbOcfDTmvl3XctH8HBedN8991+7Fr+foeI4ZvYxXDvR55IkzuEQpTOsItImEtHQTCbXTplmLSY057lwxVVi1YqoAa619VatXTYaJgDMKDQzE+PvTh/jT5J0kSUyuytb5eT616xqkl7CViHQ0Jp7pk65FfOUHP2cQCnKgFKsX/Ib52vJlnY28TLF08r/RDeIJu1pgrVWBWSUd1coLWsdAIFBISSpVpe0XxZCvn1mi5w0rPKPhOjfPX8DN8xeQDtexrCAJxsPP/IiXzp5AxZHiKaTEo5VRPFjhNkhoUndpGXdjDNQamtRrmJKwdhaqY0ENPEqJkruSkXnMhH9dP8lTgzP0veELT55mFOOUkObMBeOZo4d49OjLEMWMtCR3npJAoIorC7X+SyoJ+dqeE4Oem0+ns9G2g6xFRutxAEWjmgCGmlIiBAxxJXEQLHY8uLrErniO83pJFZxq9AyW/RpffeVFUowsKFlUkmMogrNq/mWhAq6FYDmTGGjSe1MMEJFNgrhVLWgaN1KbSCdUrlYzghkeowAyUcaupPTGET/modVjxCX40uOLkqRUvnb0ZQ7nQ0qFkZRkKAXg676mEpLpGWQi7faKsT1eTcaBjgcmDqu9EJgOZKp1yaMqhzQkUvGsU2IKP8jP8J3BCWYLYT44Hjv9Kt8fnsRUWLeCTDw54GmBN9AgWN7ISKaabyljIhdtrwc6cKXqrB4PmjWEBghRNWSrGQEjWNWP1hlCXIkLwjwxD6av8TM/RER4Ll8hV2OkJWnkyTFKE4KBq+tCEQa+Gru0qDC4JgatXok1mFoZqbWknLJrIt1jDCzQF0EUekFYCyVejeCsKkq51maCGUiBBsOb8rg/g2E4FcbqSV1JZkqO4KmSQWSVIbwpa0Wgbw4JSt85BuYrD2F1Wm/MKRsITCMXk8oPHmNWje/5s1wfzXGVzPK0H/C94ixiUFq11FOtcrSK1F0oQQoKjYitUmiJUognRylsCr7Rd2lGT+G747Nc21/gKpnjaV3ju8UyouBFO+OrtUhMJDRNU1KlSams+GqW8Re2xEVRj1NacDYvKS1QmuGtWr+JVVU7rfvyKDmKqw0VMDzgTfC1p7TOdKrgMEoLHEtTPqOHudD1ORlyzmQFnoC3ykCbHbUHLJ0SrIB4E1LxSACfKqdcjijkeFLnKYFQW9HVnhVpCAgOq6fBVaqsEvGG8nmt1cJApMQClGPlJBlmkKknlRJfr4nbtletMMcAsYuXJsWI+gWFQIEwjDzOQrWgcHUndX2jWWA3gdXM27tTGOnk8ab9dE8AvEGOMJCSZvRSqBZRk4FskoIEE8S5pQmBXi9+TiBgFjWFrfaQHbBJlW5avp8Wv4wpeNls9bHJlhIbPDHd9FBM2tOF5g1NB0SI+SSx59K0LvmLiG7btvPJLM/fQ1UYj9pT6qab5rrZiDjnt07b6b1JL5vujbW8skmbTk9mAREn8OM8H03K687M6PX6n4uiSGzyVNeS03nSdPKnk3p+pdFqQLLJaH3ub3Tu2eQeXVltBr6mICAifK6+1eQJnJnZ9u2X/nteFO83U087xTb+3tDl1OKbyGYTA9A2zZtZeoPnJ+ANjxAL8sM8H91Gd4+sorWwsHBvHMenqfekJq9u9Dr5Q+u0SRrutGlZdbIrw7TCNokDm9r3LcFX20mnIb63bZiGgAKytHTg6Ex/9o44Tk41e1JmG4pGHbNOmE0lYHQIT+XRgD03s1j3nylsrB5CJBbhlHPxHXm+drSxPpxT56o2kS+//Oorh8Phl30IHwwhUE+K6tpHO6V1bdWK1s2s2GnfbbpRbkiVEesdUZHHzaJP5/naYd5so3sjCRG4YPHSu31e3B803AIkbRfbJmDpBF4n9f1vSJXAkyLRF7Ns8E9tbO2nNh+fW/MzgMVLL90Txv6GgF4uynlNo/Z/6JgeuvGSdoPuvXP+7waqNhJxS0liLw4Gg4MtnLLx8f/JEfPmJP8/jtau6ebHfwEnFcm/pXjBEwAAAABJRU5ErkJggg==',
  });
}
