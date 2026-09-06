# overlay-guide

Generate transparent guide overlays for video editing.

- Custom guides
- Composition presets
- Cinema aspect ratios
- Safe areas
- Transparent PNG
- Web / CLI / JavaScript API

## Web

<https://sena10x.github.io/overlay-guide/>

Overlay generation runs entirely in your browser. No image or file is uploaded.
No account required.

## CLI

```sh
npx overlay-guide --preset thirds --size 1920x1080
```

```sh
# 4K composition check
npx overlay-guide --size 3840x2160 --preset thirds --preset center

# 2.39:1 cinema guide
npx overlay-guide --size 3840x2160 --cinema 2.39

# Custom guides, in a color that reads over bright footage
npx overlay-guide --horizontal 50% --vertical 960px --color '#ff2d95' --output guide.png
```

All options:

```sh
npx overlay-guide --help
```

## JavaScript

```sh
npm install overlay-guide
```

```js
import { generateOverlay } from 'overlay-guide';

const result = await generateOverlay({
  width: 1920,
  height: 1080,
  presets: ['thirds'],
});
```

`result.png` is the encoded PNG. TypeScript definitions are included.

## Development

```sh
npm install
npm run dev
npm test
npm run lint
npm run build
```

## Privacy

Images and files are never uploaded.

The hosted web app uses Google Analytics for basic usage metrics.
The CLI and npm package send no analytics.

## License

MIT
